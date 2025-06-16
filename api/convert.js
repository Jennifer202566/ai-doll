// /api/convert.js
const multer = require('multer');
const axios = require('axios');
const Replicate = require('replicate');
const fs = require('fs');
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
    console.log('req.file:', req.file);
    console.log('req.body:', req.body);

    let imageBuffer;
    if (req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.file.path) {
      imageBuffer = fs.readFileSync(req.file.path);
    } else {
      return res.status(400).json({ error: 'No image buffer found' });
    }
    console.log('imageBuffer:', imageBuffer);
    // 直接转为 data URL
    const dataUrl = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;

    // 获取风格和提示词
    const style = req.body.style || 'Action Figure';
    const userPrompt = req.body.prompt || '';
    const defaultPrompts = {
      'Action Figure': 'action figure, detailed, posable, realistic, toy, collectible',
      'Barbie Doll': 'barbie doll style, pink, glossy, fashion doll, toy, beautiful, boxed packaging',
      'Chibi': 'chibi style, cute, anime, small body, big head, cartoon, adorable',
      'Collectible': 'collectible figure, high quality, detailed, display piece, limited edition, realistic',
    };
    let prompt = userPrompt;
    if (!userPrompt) {
      prompt = defaultPrompts[style] || defaultPrompts['Action Figure'];
    }

    // 调用 replicate API
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });
    const input = {
      prompt,
      input_image: dataUrl,
      aspect_ratio: 'match_input_image',
      output_format: 'jpg',
      safety_tolerance: 2,
    };
    const output = await replicate.run('black-forest-labs/flux-kontext-pro', { input });
    console.log('Replicate output:', output);
    let outputUrl = '';
    if (typeof output === 'string') {
      outputUrl = output;
    } else if (output && output.url) {
      outputUrl = output.url;
    } else if (output && output.output) {
      if (typeof output.output === 'string') {
        outputUrl = output.output;
      } else if (Array.isArray(output.output) && output.output.length > 0) {
        outputUrl = output.output[0];
      }
    } else if (Array.isArray(output) && output.length > 0) {
      outputUrl = output[0];
    }
    console.log('outputUrl:', outputUrl);
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
};
