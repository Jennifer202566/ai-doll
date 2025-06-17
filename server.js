// server.js
// 加载环境变量
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;
const FormData = require('form-data');
const Replicate = require('replicate');
const cors = require('cors');

// 启用CORS，允许跨域请求
app.use(cors());

// 设置静态文件服务
app.use(express.static('./'));

// 检查是否在 Vercel 环境中运行
const isVercel = process.env.VERCEL === '1';

// 为 Vercel 环境设置内存存储，为本地环境设置磁盘存储
let storage;
if (isVercel) {
  // 在 Vercel 上使用内存存储
  storage = multer.memoryStorage();
  console.log('在 Vercel 环境中运行，使用内存存储');
} else {
  // 在本地使用磁盘存储
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname))
    }
  });

  // 创建上传和结果目录（仅在本地环境）
  try {
    if (!fs.existsSync('uploads')) {
      console.log('创建 uploads 目录...');
      fs.mkdirSync('uploads', { recursive: true });
    }
    if (!fs.existsSync('results')) {
      console.log('创建 results 目录...');
      fs.mkdirSync('results', { recursive: true });
    }
    console.log('目录检查完成，uploads 和 results 目录已存在');
  } catch (error) {
    console.error('创建目录时出错:', error);
    process.exit(1);
  }
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB限制
});

// 处理图片上传和转换 - 只用第三方API
app.post('/api/convert', upload.single('image'), async (req, res) => {
  try {
    console.log('收到 /api/convert 请求');
    console.log('req.file:', req.file);
    console.log('req.body:', req.body);
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    let imageBuffer;
    if (req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.file.path) {
      imageBuffer = fs.readFileSync(req.file.path);
    } else {
      return res.status(400).json({ error: 'No image buffer found' });
    }
    console.log('imageBuffer.length:', imageBuffer.length);

    // 处理 input_image - 直接使用dataURL，不再上传到Imgur
    const input_image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;
    console.log('使用 dataURL 作为 input_image');

    const style = req.body.style || 'Action Figure';
    const userPrompt = req.body.prompt || '';
    const styleKeyMap = {
      'action-figure': 'Action Figure',
      'barbie': 'Barbie Doll',
      'chibi': 'Chibi',
      'collectible': 'Collectible'
    };
    const styleKey = styleKeyMap[style] || 'Action Figure';
    const defaultPrompts = {
      'Action Figure': 'action figure, detailed, posable, realistic, toy, collectible',
      'Barbie Doll': 'barbie doll style, pink, glossy, fashion doll, toy, beautiful, boxed packaging',
      'Chibi': 'chibi style, cute, anime, small body, big head, cartoon, adorable',
      'Collectible': 'collectible figure, high quality, detailed, display piece, limited edition, realistic',
    };
    let prompt = '';
    if (userPrompt) {
      prompt = userPrompt + ' based on the upload picture';
    } else {
      prompt = (defaultPrompts[styleKey] || defaultPrompts['Action Figure']) + ' based on the upload picture';
    }
    console.log('最终 prompt:', prompt);

    // 准备Replicate API请求数据
    const replicateApiKey = process.env.REPLICATE_API_TOKEN;
    if (!replicateApiKey) {
      return res.status(500).json({
        error: 'Replicate API key not configured',
      });
    }
    
    const replicateInput = {
      prompt,
      input_image,
      aspect_ratio: 'match_input_image',
      output_format: 'jpg',
      safety_tolerance: 2,
    };
    console.log('replicate input:', replicateInput);
    
    try {
      console.log('开始调用Replicate API...');
      
      // 步骤1: 创建预测
      const createResponse = await axios.post(
        'https://api.replicate.com/v1/predictions',
        {
          version: "0f1178f5a27e9aa2d2d39c8a43c110f7fa7cbf64062ff04a04cd40899e546065",
          input: replicateInput
        },
        {
          headers: {
            'Authorization': `Token ${replicateApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const predictionId = createResponse.data.id;
      console.log('预测创建成功，ID:', predictionId);
      
      // 步骤2: 轮询预测状态
      let outputUrl = '';
      let retries = 0;
      const maxRetries = 30;
      const pollingInterval = 2000; // 2秒
      
      while (retries < maxRetries) {
        console.log(`第${retries + 1}次检查预测结果...`);
        
        const statusResponse = await axios.get(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          {
            headers: {
              'Authorization': `Token ${replicateApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const prediction = statusResponse.data;
        console.log('预测状态:', prediction.status);
        
        if (prediction.status === 'succeeded') {
          console.log('预测完成，输出:', prediction.output);
          
          // 处理不同格式的输出
          if (Array.isArray(prediction.output) && prediction.output.length > 0) {
            outputUrl = prediction.output[0];
            console.log('从数组中获取图片URL:', outputUrl);
          } else if (typeof prediction.output === 'string') {
            // 如果输出是字符串URL，直接使用
            outputUrl = prediction.output;
            console.log('直接使用字符串URL:', outputUrl);
          } else {
            console.error('预测成功但输出格式不符合预期:', prediction.output);
          }
          break;
        } else if (prediction.status === 'failed') {
          console.error('预测失败:', prediction.error);
          break;
        } else if (prediction.status === 'canceled') {
          console.error('预测被取消');
          break;
        }
        
        // 等待指定时间后再次检查
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
        retries++;
      }
      
      console.log('最终outputUrl:', outputUrl);
      
      if (outputUrl) {
        console.log('最终返回给前端的数据:', {
          status: 'success',
          outputImage: outputUrl
        });
        
        return res.status(200).json({
          status: 'success',
          outputImage: outputUrl
        });
      } else {
        return res.status(200).json({
          status: 'failed',
          error: 'No image generated after multiple attempts',
        });
      }
    } catch (error) {
      console.error('调用Replicate API时出错:', error);
      if (error.response) {
        console.error('API错误响应:', error.response.data);
        return res.status(500).json({
          error: 'Error generating image',
          details: error.response.data,
        });
      } else {
        return res.status(500).json({
          error: 'Error generating image',
          details: error.message,
        });
      }
    }
  } catch (error) {
    console.error('Error generating image:', error);
    if (error.response) {
      console.error('Replicate error response:', error.response.data);
      return res.status(500).json({
        error: 'Error generating image',
        details: error.response.data,
        status: error.response.status,
      });
    } else {
      return res.status(500).json({
        error: 'Error generating image',
        details: error.message,
      });
    }
  }
});

// /api/check-result 路由已废弃，直接返回 410
app.get('/api/check-result', (req, res) => {
  res.status(410).json({ error: 'This endpoint is deprecated. Please use /api/convert only.' });
});

// 添加一个简单的健康检查端点
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// 添加错误处理中间件
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Server error',
    message: err.message
  });
});

// 处理 404 错误
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `The requested resource ${req.path} was not found`
  });
});

// 添加图片代理路由
app.get('/api/proxy-image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Missing image URL' });
    }
    
    console.log('代理图片请求:', imageUrl);
    
    // 获取图片内容
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream'
    });
    
    // 设置适当的内容类型
    res.setHeader('Content-Type', response.headers['content-type']);
    
    // 流式传输图片数据
    response.data.pipe(res);
  } catch (error) {
    console.error('代理图片出错:', error);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// 只有在直接运行此文件时才启动服务器
if (require.main === module) {
  app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    console.log('准备就绪，可以开始生成 AI 人偶了！');
  });
}

// 导出 Express 应用，以便在 api/convert.js 中使用
module.exports = app;
