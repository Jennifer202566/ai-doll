// api/convert.js - Vercel Serverless Function
// 直接在API路由中实现处理逻辑，不依赖server.js

const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// 使用内存存储
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB限制
});

// 处理multipart/form-data请求的中间件
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

// 主处理函数
module.exports = async (req, res) => {
  console.log('API路由 /api/convert 被调用');
  
  // 确保这是POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  }
  
  try {
    // 运行multer中间件处理文件上传
    await runMiddleware(req, res, upload.single('image'));
    
    console.log('req.file:', req.file);
    console.log('req.body:', req.body);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    
    // 获取图像数据
    const imageBuffer = req.file.buffer;
    console.log('imageBuffer.length:', imageBuffer.length);
    
    // 创建base64图像
    const input_image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;
    console.log('使用 dataURL 作为 input_image');
    
    // 获取样式和提示词
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
}; 