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
  const form = new FormData();
  form.append('image', imageBuffer.toString('base64'));
  try {
    console.log('[Imgur] 开始上传...');
    const response = await axios.post('https://api.imgur.com/3/image', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Client-ID ${IMGUR_CLIENT_ID}`
      }
    });
    console.log('[Imgur] 上传响应:', response.data);
    if (response.data && response.data.data && response.data.data.link) {
      return response.data.data.link;
    }
    throw new Error('Imgur 上传失败');
  } catch (err) {
    console.error('[Imgur] 上传失败:', err.message, err.response?.data);
    if (err.response) {
      console.error('[Imgur] 响应状态:', err.response.status);
      console.error('[Imgur] 响应内容:', err.response.data);
    } else if (err.request) {
      console.error('[Imgur] 无响应:', err.request);
    }
    throw err;
  }
}

// 处理图片上传和转换 - 只用第三方API
app.post('/api/convert', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    let imageBuffer;
    if (isVercel) {
      imageBuffer = req.file.buffer;
    } else {
      const imagePath = req.file.path;
      imageBuffer = fs.readFileSync(imagePath);
    }
    // 1. 上传图片到 Imgur
    let imgurUrl = '';
    try {
      console.log('[Imgur] 上传前，准备上传图片...');
      imgurUrl = await uploadToImgur(imageBuffer);
      console.log('[Imgur] 图片URL:', imgurUrl);
    } catch (imgurErr) {
      console.error('[Imgur] 上传异常:', imgurErr.message, imgurErr.response?.data);
      return res.status(500).json({ error: 'Imgur 上传失败', details: imgurErr.message, imgur: imgurErr.response?.data });
    }
    const style = req.body.style || '';
    const userPrompt = req.body.prompt || '';
    const styleMap = {
      'action-figure': 'Action Figure',
      'barbie': 'Barbie Doll',
      'chibi': 'Chibi',
      'collectible': 'Collectible'
    };
    const styleKey = styleMap[style] || 'Action Figure';
    const defaultPrompts = {
      'Action Figure': 'action figure, detailed, posable, realistic, toy, collectible',
      'Barbie Doll': 'barbie doll style, pink, glossy, fashion doll, toy, beautiful, boxed packaging',
      'Chibi': 'chibi style, cute, anime, small body, big head, cartoon, adorable',
      'Collectible': 'collectible figure, high quality, detailed, display piece, limited edition, realistic'
    };
    // 2. 拼接prompt
    let prompt = userPrompt;
    if (!userPrompt) {
      prompt = defaultPrompts[styleKey] || defaultPrompts['Action Figure'];
    }
    const finalPrompt = imgurUrl + ' ' + prompt;
    console.log('[AI API] Final prompt:', finalPrompt);
    // 3. 调用第三方API
    const aiPayload = {
      model: 'flux-kontext-pro',
      prompt: finalPrompt,
      size: '1024x1024'
    };
    console.log('[AI API] 请求体:', aiPayload);
    let aiResponse;
    try {
      console.log('[AI API] 开始请求...');
      aiResponse = await axios.post('https://api.apicore.ai/v1/images/generations', aiPayload, {
        headers: {
          'Authorization': `Bearer ${process.env.THIRD_PARTY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('[AI API] 返回内容:', aiResponse.data);
    } catch (aiErr) {
      console.error('[AI API] 请求失败:', aiErr.message, aiErr.response?.data);
      if (aiErr.response) {
        console.error('[AI API] 响应状态:', aiErr.response.status);
        console.error('[AI API] 响应内容:', aiErr.response.data);
      } else if (aiErr.request) {
        console.error('[AI API] 无响应:', aiErr.request);
      }
      return res.status(500).json({ error: 'AI API 请求失败', details: aiErr.message, ai: aiErr.response?.data });
    }
    const data = aiResponse.data;
    if (data && Array.isArray(data.data) && data.data.length > 0) {
      const generatedImageUrl = data.data[0].url;
      return res.status(200).json({
        status: 'success',
        outputImage: generatedImageUrl
      });
    } else {
      return res.status(200).json({
        status: 'failed',
        error: 'No image generated'
      });
    }
  } catch (error) {
    console.error('[全局异常] Error generating image:', error);
    if (error.response) {
      console.error('[全局异常] API error status:', error.response.status);
      console.error('[全局异常] API error data:', error.response.data);
      return res.status(500).json({
        error: 'Error generating image',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      console.error('[全局异常] No response received from API');
      return res.status(500).json({
        error: 'No response from API',
        details: error.request
      });
    } else {
      console.error('[全局异常] Error message:', error.message);
      return res.status(500).json({
        error: 'Error generating image',
        details: error.message
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
