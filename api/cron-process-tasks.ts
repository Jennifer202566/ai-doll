import { getTask, updateTask } from '@/lib/redis'
import { Redis } from '@upstash/redis'
import axios from 'axios'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
})

export default async function handler(req, res) {
  // 只允许 Vercel Cron 调用
  if (req.headers['x-vercel-cron'] !== '1') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  // 扫描所有 pending 任务
  const keys = await redis.keys('task:*')
  let processed = 0

  for (const key of keys) {
    const task = await getTask(key.replace('task:', ''))
    if (task && task.status === 'pending') {
      try {
        // 这里根据你的业务需要处理图片生成
        const aiResponse = await axios.post('https://api.apicore.ai/v1/images/generations', {
          model: 'flux-kontext-pro',
          prompt: task.input.prompt,
          size: '1024x1024',
          image: task.input.imageUrl
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.THIRD_PARTY_API_KEY}`,
            'Content-Type': 'application/json'
          }
        })

        const data = aiResponse.data
        if (data && Array.isArray(data.data) && data.data.length > 0) {
          await updateTask(task.id, {
            status: 'success',
            result: { outputImage: data.data[0].url }
          })
        } else {
          await updateTask(task.id, {
            status: 'failed',
            result: { error: 'No image generated' }
          })
        }
      } catch (error) {
        await updateTask(task.id, {
          status: 'failed',
          result: { error: error.message }
        })
      }
      processed++
    }
  }

  return res.status(200).json({ processed })
} 