// api/convert.js - Vercel Serverless Function
// 直接在API路由中实现处理逻辑，不依赖server.js

const axios = require('axios');
const formidable = require('formidable');
const fs = require('fs');

// 导出处理函数
module.exports = async (req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 确保这是POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  }

  try {
    console.log('API路由 /api/convert 被调用 (POST)');
    
    // 解析表单数据
    const form = new formidable.IncomingForm();
    
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('解析表单数据出错:', err);
        return res.status(500).json({ error: 'Error parsing form data' });
      }
      
      console.log('表单字段:', fields);
      console.log('上传的文件:', files);
      
      if (!files.image) {
        return res.status(400).json({ error: 'No image uploaded' });
      }
      
      try {
        // 获取文件信息
        const uploadedFile = files.image;
        const fileType = uploadedFile.mimetype || 'image/jpeg';
        
        // 读取文件内容
        const fileData = fs.readFileSync(uploadedFile.filepath);
        // 转换为base64
        const base64Data = fileData.toString('base64');
        const input_image = `data:${fileType};base64,${base64Data}`;
        console.log('成功创建base64图像数据');
        
        // 获取样式和提示词
        const style = fields.style || 'Action Figure';
        const userPrompt = fields.prompt || '';
        
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
        console.error('处理图像或调用API时出错:', error);
        return res.status(500).json({
          error: 'Error processing image or calling API',
          details: error.message,
        });
      }
    });
  } catch (error) {
    console.error('Error in convert API:', error);
    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
}; 