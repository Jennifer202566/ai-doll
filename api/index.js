// api/index.js
// 导入server.js中导出的Express应用
const app = require('../server');

// 导出处理函数，使用app处理请求
module.exports = (req, res) => {
  console.log('API根路径被调用，转发到server.js');
  return app(req, res);
}; 