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

// Imgur 配置
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID;

async function uploadToImgur(imageBuffer) {
  if (!IMGUR_CLIENT_ID) throw new Error('IMGUR_CLIENT_ID not set');
  const form = new FormData();
  form.append('image', imageBuffer.toString('base64'));
  const response = await axios.post('https://api.imgur.com/3/image', form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Client-ID ${IMGUR_CLIENT_ID}`
    }
  });
  if (response.data && response.data.data && response.data.data.link) {
    return response.data.data.link;
  }
  throw new Error('Imgur 上传失败');
}

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

    // 处理 input_image
    let input_image;
    if (imageBuffer.length <= 256 * 1024) {
      input_image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;
      console.log('使用 dataURL 作为 input_image');
    } else {
      input_image = await uploadToImgur(imageBuffer);
      console.log('使用 imgur URL 作为 input_image:', input_image);
    }

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

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });
    const input = {
      prompt,
      input_image,
      aspect_ratio: 'match_input_image',
      output_format: 'jpg',
      safety_tolerance: 2,
    };
    console.log('replicate input:', input);
    
    try {
      console.log('开始调用Replicate API...');
      
      // 创建预测并获取预测ID
      const prediction = await replicate.predictions.create({
        version: "4a0f5b5b5e5c3c7aeeb0156b3e96bf6d6e1095d9d4d0b0de0f0f0f0f0f0f0f0",
        input: input,
        webhook: null,
        webhook_events_filter: null
      });
      
      console.log('预测创建成功，ID:', prediction.id);
      
      // 等待预测完成
      let outputUrl = '';
      let retries = 0;
      const maxRetries = 10;
      
      while (retries < maxRetries) {
        console.log(`第${retries + 1}次检查预测结果...`);
        
        // 获取预测状态
        const status = await replicate.predictions.get(prediction.id);
        console.log('预测状态:', status.status);
        
        if (status.status === 'succeeded') {
          console.log('预测完成，输出:', status.output);
          
          // 从输出中提取URL
          if (Array.isArray(status.output) && status.output.length > 0) {
            outputUrl = status.output[0];
            console.log('获取到图片URL:', outputUrl);
            break;
          } else {
            console.error('预测成功但输出格式不符合预期:', status.output);
            break;
          }
        } else if (status.status === 'failed') {
          console.error('预测失败:', status.error);
          break;
        }
        
        // 等待2秒后再次检查
        await new Promise(resolve => setTimeout(resolve, 2000));
        retries++;
      }
      
      console.log('outputUrl:', outputUrl);
      console.log('最终返回给前端的数据:', {
        status: outputUrl ? 'success' : 'failed',
        outputImage: outputUrl || null
      });
      
      if (outputUrl) {
        return res.status(200).json({
          status: 'success',
          outputImage: outputUrl,
        });
      } else {
        return res.status(200).json({
          status: 'failed',
          error: 'No image generated after multiple attempts',
        });
      }
    } catch (error) {
      console.error('调用Replicate API时出错:', error);
      return res.status(500).json({
        error: 'Error generating image',
        details: error.message,
      });
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

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log('准备就绪，可以开始生成 AI 人偶了！');
});
