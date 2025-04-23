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

// 处理图片上传和转换
app.post('/api/convert', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // 获取图片数据
    let base64Image;
    if (isVercel) {
      // 在 Vercel 上，图片已经在内存中
      const imageBuffer = req.file.buffer;
      base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;
    } else {
      // 在本地，从文件系统读取
      const imagePath = req.file.path;
      const imageBuffer = fs.readFileSync(imagePath);
      base64Image = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`;
    }

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

    // 输出调试信息
    console.log('Calling Replicate API with prompt:', prompt);

    // 调用Replicate API
    const response = await axios.post('https://api.replicate.com/v1/predictions', {
      // 使用 ControlNet 模型，更适合保持原始图像的结构和姿势
      version: "8ebda4c70b3ea2a2bf86e44595afb562a2cdf85525c620f1671a78113c9f325b", // jagilley/controlnet 模型
      input: {
        image: base64Image,
        prompt: prompt,
        // 简化参数，专注于最重要的参数
        num_samples: 1,  // 只生成一个样本
        guessmode: false, // 不使用猜测模式
        image_resolution: 768, // 输出分辨率
        low_threshold: 100,
        high_threshold: 200
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`
      }
    });

    // Replicate API是异步的，需要轮询获取结果
    let prediction = response.data;
    while (prediction.status !== "succeeded" && prediction.status !== "failed") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await axios.get(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`
        }
      });
      prediction = statusResponse.data;
    }

    if (prediction.status === "failed") {
      throw new Error("Image transformation failed");
    }

    // 获取生成的图片 URL
    const generatedImageUrl = prediction.output;

    if (isVercel) {
      // 在 Vercel 上，直接返回图片 URL
      res.json({
        status: 'success',
        outputImage: generatedImageUrl,
        predictionId: prediction.id
      });
    } else {
      // 在本地，下载图片并保存
      const generatedImageResponse = await axios.get(generatedImageUrl, { responseType: 'arraybuffer' });
      const resultPath = `results/result-${Date.now()}.jpg`;
      fs.writeFileSync(resultPath, generatedImageResponse.data);

      res.json({
        status: 'success',
        outputImage: '/' + resultPath,
        predictionId: prediction.id
      });
    }
  } catch (error) {
    console.error('Error during image transformation:', error);
    // 输出更详细的错误信息
    if (error.response) {
      // 服务器响应了错误状态码
      console.error('Replicate API error status:', error.response.status);
      console.error('Replicate API error data:', error.response.data);
      res.status(500).json({
        error: 'Image transformation failed',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      // 请求发出但没有收到响应
      console.error('No response received from Replicate API');
      res.status(500).json({
        error: 'No response from Replicate API',
        details: 'Request was made but no response was received'
      });
    } else {
      // 设置请求时发生错误
      console.error('Error message:', error.message);
      res.status(500).json({
        error: 'Image transformation failed',
        details: error.message
      });
    }
  }
});

// 检查生成结果
app.get('/api/check-result', async (req, res) => {
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
      // 预测成功，下载生成的图片
      console.log('Prediction succeeded, output:', prediction.output);

      // ControlNet 模型可能返回多个图像（数组）或单个 URL
      let generatedImageUrl;
      if (Array.isArray(prediction.output)) {
        // 如果是数组，使用第一个图像
        console.log('Output is an array with', prediction.output.length, 'items');
        generatedImageUrl = prediction.output[0];
      } else {
        // 如果是单个 URL
        generatedImageUrl = prediction.output;
      }

      console.log('Using image URL:', generatedImageUrl);

      if (isVercel) {
        // 在 Vercel 上，直接返回图片 URL
        console.log('在 Vercel 上直接返回图片 URL');
        return res.json({
          status: 'success',
          outputImage: generatedImageUrl
        });
      } else {
        // 在本地，下载图片并保存
        try {
          const generatedImageResponse = await axios.get(generatedImageUrl, { responseType: 'arraybuffer' });
          const resultPath = `results/result-${Date.now()}.jpg`;
          fs.writeFileSync(resultPath, generatedImageResponse.data);

          console.log('Image saved to:', resultPath);

          // 返回结果
          return res.json({
            status: 'success',
            outputImage: '/' + resultPath
          });
        } catch (downloadError) {
          console.error('Error downloading generated image:', downloadError);
          return res.json({
            status: 'failed',
            error: 'Error downloading generated image: ' + downloadError.message,
            outputUrl: generatedImageUrl // 返回原始 URL 以便调试
          });
        }
      }
    } else if (prediction.status === 'failed') {
      // 预测失败
      console.error('Prediction failed:', prediction.error);
      return res.json({
        status: 'failed',
        error: prediction.error || 'Generation failed'
      });
    } else {
      // 仍在处理中
      console.log('Prediction still processing...');
      return res.json({
        status: 'processing'
      });
    }
  } catch (error) {
    console.error('Error checking result:', error);
    // 输出更详细的错误信息
    if (error.response) {
      console.error('API error status:', error.response.status);
      console.error('API error data:', error.response.data);
      res.status(500).json({
        error: 'Error checking result',
        details: error.response.data,
        status: error.response.status
      });
    } else {
      res.status(500).json({
        error: 'Error checking result',
        details: error.message
      });
    }
  }
});

// 检查 API Token 是否已设置
if (!process.env.REPLICATE_API_TOKEN) {
  console.error('错误: REPLICATE_API_TOKEN 未设置。请在 .env 文件中设置您的 API Token。');
  process.exit(1);
} else {
  // 显示部分 token 以确认已加载
  const tokenPreview = process.env.REPLICATE_API_TOKEN.substring(0, 5) + '...' +
                       process.env.REPLICATE_API_TOKEN.substring(process.env.REPLICATE_API_TOKEN.length - 4);
  console.log(`已加载 Replicate API Token: ${tokenPreview}`);
}

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log('准备就绪，可以开始生成 AI 人偶了！');
});