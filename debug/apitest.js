const axios = require('axios');
require('dotenv').config();

async function testThirdPartyAPI() {
  try {
    const response = await axios.post('https://ismaque.org/v1/images/generations', {
      model: 'flux-kontext-pro',
      prompt: 'https://oss.ffire.cc/files/kling_watermark.png Transform this person into a Barbie doll in packaging box, pink theme, glossy plastic toy appearance',
      size: '1024x1024'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.THIRD_PARTY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('API 调用成功，返回数据:');
    console.dir(response.data, { depth: 10 });
  } catch (error) {
    console.error('API 调用失败:');
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('返回内容:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testThirdPartyAPI(); 