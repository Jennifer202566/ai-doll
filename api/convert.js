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

    // 根据风格构建提示词
    let prompt = "Create a high-quality action figure of this person";
    if (userPrompt) {
      prompt += ", " + userPrompt;
    }
    if (style === 'Barbie Doll') {
      prompt += ", barbie doll style, toy doll, pink, fashion doll";
    } else if (style === 'Chibi') {
      prompt += ", chibi style, cute, anime, small body, big head";
    } else if (style === 'Collectible') {
      prompt += ", collectible figure, detailed, high quality, display piece";
    } else {
      prompt += ", action figure, detailed, posable, realistic";
    }

    console.log('Using prompt:', prompt);
    console.log('Calling Replicate API with prompt:', prompt);

// 调用 Replicate API
const response = await axios.post('https://api.replicate.com/v1/predictions', {
  version: "06d6fae3b75ab68a28cd2900afa6033166910dd09fd9751047043a5bbb4c184b",
  input: {
    prompt: prompt,
    image: base64Image,
    seed: 18457,
    num_inference_steps: 30,
    guidance_scale: 7.5,
    negative_prompt: "low quality, bad anatomy, blurry, pixelated, disfigured, deformed"
  }
}, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`
  }
});

    // 返回预测 ID
    const prediction = response.data;
    console.log('Prediction started with ID:', prediction.id);

    return res.status(200).json({
      status: 'processing',
      predictionId: prediction.id,
      message: '图像处理已开始，请使用 predictionId 查询结果'
    });

  } catch (error) {
    console.error('Error during image transformation:', error);
    
    if (error.response) {
      console.error('Replicate API error status:', error.response.status);
      console.error('Replicate API error data:', error.response.data);
      return res.status(500).json({
        error: 'Image transformation failed',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      console.error('No response received from Replicate API');
      return res.status(500).json({
        error: 'No response from Replicate API',
        details: 'Request was made but no response was received'
      });
    } else {
      console.error('Error message:', error.message);
      return res.status(500).json({
        error: 'Image transformation failed',
        details: error.message
      });
    }
  }
};
