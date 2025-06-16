import { Redis } from '@upstash/redis'

// Redis 客户端实例
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
})

// 任务数据接口
export interface TaskData {
  id: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  input: {
    imageUrl: string;
    style: string;
    prompt: string;
  };
  result?: {
    outputImage?: string;
    error?: string;
  };
}

// 任务相关的方法
export async function createTask(taskData: TaskData): Promise<void> {
  await redis.set(`task:${taskData.id}`, JSON.stringify(taskData))
}

export async function getTask(taskId: string): Promise<TaskData | null> {
  const data = await redis.get<string>(`task:${taskId}`)
  return data ? JSON.parse(data) : null
}

export async function updateTask(taskId: string, updates: Partial<TaskData>): Promise<TaskData | null> {
  const task = await getTask(taskId)
  if (!task) return null
  
  const updatedTask = {
    ...task,
    ...updates,
    updatedAt: new Date()
  }
  
  await redis.set(`task:${taskId}`, JSON.stringify(updatedTask))
  return updatedTask
} 