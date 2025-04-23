// /api/check-result.js
const axios = require('axios');
require('dotenv').config();

module.exports = async (req, res) => {
  // 确保是 GET 请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed, use GET' });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'No prediction ID provided' });
    }

    console.log('Checking prediction status for ID:', id);

    // 调用 Replicate API 检查预测状态
    const response = await axios.get(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`
      }
    });

    const prediction = response.data;
    console.log('Prediction status:', prediction.status);

    if (prediction.status === 'succeeded') {
      // 预测成功
      console.log('Prediction succeeded, output:', prediction.output);

      // 处理输出
      let generatedImageUrl;
      if (Array.isArray(prediction.output)) {
        console.log('Output is an array with', prediction.output.length, 'items');
        generatedImageUrl = prediction.output[0];
      } else {
        generatedImageUrl = prediction.output;
      }

      console.log('Using image URL:', generatedImageUrl);

      // 在 Vercel 上，直接返回图片 URL
      return res.status(200).json({
        status: 'success',
        outputImage: generatedImageUrl
      });
    } else if (prediction.status === 'failed') {
      // 预测失败
      console.error('Prediction failed:', prediction.error);
      return res.status(200).json({
        status: 'failed',
        error: prediction.error || 'Generation failed'
      });
    } else {
      // 仍在处理中
      console.log('Prediction still processing...');
      return res.status(200).json({
        status: 'processing'
      });
    }
  } catch (error) {
    console.error('Error checking result:', error);
    
    if (error.response) {
      console.error('API error status:', error.response.status);
      console.error('API error data:', error.response.data);
      return res.status(500).json({
        error: 'Error checking result',
        details: error.response.data,
        status: error.response.status
      });
    } else {
      return res.status(500).json({
        error: 'Error checking result',
        details: error.message
      });
    }
  }
};
