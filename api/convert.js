// /api/convert.js
const multer = require('multer');
const axios = require('axios');
require('dotenv').config();

// 使用内存存储
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 处理文件上传的中间件
const uploadMiddleware = upload.single('image');

// 主处理函数
module.exports = async (req, res) => {
  // 确保是 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed, use POST' });
  }

  // 使用 Promise 包装 multer 中间件
  await new Promise((resolve, reject) => {
    uploadMiddleware(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // 获取图片数据
    const imageBuffer = req.file.buffer;
    const base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;

    // 获取风格和提示词
    const style = req.body.style || 'Action Figure';
    const userPrompt = req.body.prompt || '';

    // 构建 prompt
    let prompt = userPrompt;
    if (style) {
      prompt = `${prompt} ${style}`.trim();
    }

    // 调用第三方 API
    const response = await axios.post('https://ismaque.org/v1/images/generations', {
      model: 'flux-kontext-pro',
      prompt,
      size: '1024x1024',
      // 这里假设第三方API支持base64图片，如果不支持需调整为URL上传
      image: base64Image
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.THIRD_PARTY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = response.data;
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
    console.error('Error generating image:', error);
    if (error.response) {
      return res.status(500).json({
        error: 'Error generating image',
        details: error.response.data,
        status: error.response.status
      });
    } else {
      return res.status(500).json({
        error: 'Error generating image',
        details: error.message
      });
    }
  }
};
