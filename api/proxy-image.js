// api/proxy-image.js - Vercel Serverless Function
// 直接在API路由中实现代理图片功能，不依赖server.js

const axios = require('axios');

module.exports = async (req, res) => {
  console.log('API路由 /api/proxy-image 被调用');
  
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Missing image URL' });
    }
    
    console.log('代理图片请求:', imageUrl);
    
    // 获取图片内容
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer'
    });
    
    // 设置适当的内容类型
    res.setHeader('Content-Type', response.headers['content-type']);
    // 设置缓存控制
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    // 返回图片数据
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('代理图片出错:', error);
    return res.status(500).json({ error: 'Failed to proxy image' });
  }
}; 