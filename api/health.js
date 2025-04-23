// /api/health.js
module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API is working',
    method: req.method,
    timestamp: new Date().toISOString()
  });
};
