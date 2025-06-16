import { v4 as uuidv4 } from 'uuid'
import { createTask } from '@/lib/redis'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 解析图片和参数（假设 image 是 base64 字符串或 URL，按你前端实际传参调整）
  const { image, style, prompt } = req.body

  const taskId = uuidv4()

  await createTask({
    id: taskId,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    input: { imageUrl: image, style, prompt }
  })

  return res.status(200).json({ taskId, status: 'pending' })
} 