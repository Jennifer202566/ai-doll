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
    
    // 使用异步迭代器方式处理输出
    let outputUrl = '';
    try {
      console.log('开始调用Replicate API...');
      const output = await replicate.run('black-forest-labs/flux-kontext-pro', { input });
      console.log('Replicate output类型:', typeof output);
      
      // 检查是否是异步迭代器
      if (output && typeof output[Symbol.asyncIterator] === 'function') {
        console.log('检测到异步迭代器输出');
        // 使用for await...of处理异步迭代器
        const chunks = [];
        for await (const chunk of output) {
          console.log('收到chunk:', chunk);
          chunks.push(chunk);
        }
        console.log('所有chunks:', chunks);
        if (chunks.length > 0) {
          // 通常第一个元素是URL
          outputUrl = chunks[0];
          console.log('从chunks获取URL:', outputUrl);
        }
      }
      // 如果不是异步迭代器，尝试其他方法
      else if (output && typeof output === 'object' && output.constructor && output.constructor.name === 'ReadableStream') {
        console.log('检测到ReadableStream输出');
        
        // 首先尝试直接调用url函数
        if (typeof output.url === 'function') {
          try {
            outputUrl = output.url();
            console.log('从ReadableStream的url()函数获取URL成功:', outputUrl);
          } catch (e) {
            console.error('调用ReadableStream的url()函数失败:', e);
          }
        }
        
        // 如果url()函数调用失败，尝试读取流
        if (!outputUrl) {
          try {
            const reader = output.getReader();
            let chunks = [];
            let done = false;
            
            console.log('开始读取ReadableStream...');
            while (!done) {
              try {
                const result = await reader.read();
                done = result.done;
                if (result.value) {
                  chunks.push(result.value);
                  console.log('读取到chunk:', result.value.length, '字节');
                }
              } catch (e) {
                console.error('读取ReadableStream时出错:', e);
                break;
              }
            }
            console.log('ReadableStream读取完成, 共', chunks.length, '个chunks');
            
            // 尝试从chunks中获取URL
            if (chunks.length > 0) {
              try {
                const jsonData = chunks.map(chunk => new TextDecoder().decode(chunk)).join('');
                console.log('解码后的数据:', jsonData);
                const parsedData = JSON.parse(jsonData);
                console.log('从ReadableStream解析的数据:', parsedData);
                if (parsedData && parsedData.length > 0) {
                  outputUrl = parsedData[0];
                  console.log('从解析的数据中获取URL成功:', outputUrl);
                }
              } catch (e) {
                console.error('解析ReadableStream数据时出错:', e);
              }
            }
          } catch (e) {
            console.error('处理ReadableStream时出错:', e);
          }
        }
      } else if (output && typeof output.url === 'function') {
        try {
          outputUrl = output.url();
          console.log('outputUrl (from .url()):', outputUrl);
        } catch (e) {
          console.error('调用output.url()时出错:', e);
        }
      } else if (typeof output === 'string') {
        outputUrl = output;
      } else if (output && output.url) {
        outputUrl = output.url;
      } else if (output && output.output) {
        if (typeof output.output === 'string') outputUrl = output.output;
        else if (Array.isArray(output.output) && output.output.length > 0) outputUrl = output.output[0];
      } else if (Array.isArray(output) && output.length > 0) {
        outputUrl = output[0];
      }
    } catch (error) {
      console.error('调用Replicate API时出错:', error);
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
        error: 'No image generated',
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
