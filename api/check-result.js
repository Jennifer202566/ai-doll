// /api/check-result.js
const axios = require('axios');
require('dotenv').config();

// 请将 API KEY 存入 .env 文件，变量名为 THIRD_PARTY_API_KEY
module.exports = async (req, res) => {
  // 确保是 GET 请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed, use GET' });
  }

  try {
    const { prompt } = req.query;

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    console.log('Generating image for prompt:', prompt);

    // 调用第三方图片生成 API
    const response = await axios.post('https://ismaque.org/v1/images/generations', {
      model: 'flux-kontext-pro',
      prompt,
      size: '1024x1024'
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
