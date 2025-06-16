// api/check-status.ts
import { getTask } from '@/lib/redis'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { taskId } = req.query
  
  try {
    const task = await getTask(taskId as string)
    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    return res.json({
      status: task.status,
      result: task.result
    })
  } catch (error) {
    console.error('Error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}