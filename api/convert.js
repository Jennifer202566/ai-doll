// /api/convert.js
const multer = require('multer');
const axios = require('axios');
require('dotenv').config();
const { Redis } = require('@upstash/redis');
const { createTask, updateTask, getTask } = require('@/lib/redis');
const { v4 as uuidv4 } = require('uuid');

// 使用内存存储
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 处理文件上传的中间件
const uploadMiddleware = upload.single('image');

// 主处理函数
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. 创建任务
    const taskId = uuidv4();
    const task = await createTask({
      id: taskId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      input: {
        imageUrl: '', // 待上传
        style: req.body.style,
        prompt: req.body.prompt
      }
    });

    // 2. 异步处理图片
    processImageAsync(taskId).catch(console.error);

    return res.json({
      status: 'pending',
      taskId
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// 异步处理函数
async function processImageAsync(taskId: string) {
  try {
    // 1. 更新状态为处理中
    await updateTask(taskId, { status: 'processing' });

    // 2. 上传到 Imgur
    const task = await getTask(taskId);
    const imgurUrl = await uploadToImgur(task.input.imageBuffer);
    
    // 3. 更新图片URL
    await updateTask(taskId, {
      input: { ...task.input, imageUrl: imgurUrl }
    });

    // 4. 调用 AI API
    const aiResult = await generateImage(imgurUrl, task.input.prompt);
    
    // 5. 更新处理结果
    await updateTask(taskId, {
      status: 'success',
      result: {
        outputImage: aiResult.imageUrl
      }
    });
  } catch (error) {
    // 处理失败，更新状态
    await updateTask(taskId, {
      status: 'failed',
      result: {
        error: error.message
      }
    });
  }
}

async function handleImageUpload() {
  try {
    // 1. 上传图片获取taskId
    const { taskId } = await uploadImage();
    
    // 2. 开始轮询检查状态
    const checkStatus = async () => {
      const result = await fetch(`/api/check-status/${taskId}`);
      const data = await result.json();
      
      if (data.status === 'pending') {
        // 继续轮询
        setTimeout(checkStatus, 2000);
      } else if (data.status === 'success') {
        // 显示结果
        displayResult(data.result);
      } else {
        // 处理失败
        handleError(data.message);
      }
    };

    // 开始首次检查
    checkStatus();
  } catch (error) {
    handleError(error);
  }
}

interface TaskData {
  id: string;          // 任务ID
  status: 'pending' | 'processing' | 'success' | 'failed';  // 任务状态
  createdAt: Date;     // 创建时间
  updatedAt: Date;     // 更新时间
  input: {             // 输入数据
    imageUrl: string;  // Imgur上传后的图片URL
    style: string;     // 选择的风格
    prompt: string;    // 用户提示词
  };
  result?: {           // 处理结果
    outputImage?: string;  // 生成的图片URL
    error?: string;       // 错误信息
  };
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// 保存任务
async function saveTask(taskId: string, taskData: TaskData) {
  await redis.set(`task:${taskId}`, JSON.stringify(taskData));
}

// 获取任务
async function getTask(taskId: string): Promise<TaskData | null> {
  const task = await redis.get(`task:${taskId}`);
  return task ? JSON.parse(task) : null;
}

// 任务相关的方法
export async function createTask(taskData: TaskData) {
  return redis.set(`task:${taskData.id}`, JSON.stringify(taskData));
}

export async function updateTask(taskId: string, updates: Partial<TaskData>) {
  const task = await getTask(taskId);
  if (!task) return null;
  
  const updatedTask = {
    ...task,
    ...updates,
    updatedAt: new Date()
  };
  
  await redis.set(`task:${taskId}`, JSON.stringify(updatedTask));
  return updatedTask;
}
