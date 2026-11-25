import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { med_id, takecare_id } = req.body;
  if (!med_id || !takecare_id) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  try {
    const existingLog = await prisma.medication_logs.findFirst({
      where: {
        med_id: Number(med_id),
        med_date: today,
      },
    });

    if (existingLog) {
      await prisma.medication_logs.update({
        where: { log_id: existingLog.log_id },
        data: {
          status: 'TAKEN',
          taken_at: new Date(),
        },
      });
    } else {
      await prisma.medication_logs.create({
        data: {
          med_id: Number(med_id),
          takecare_id: Number(takecare_id),
          med_date: today,
          status: 'TAKEN',
          taken_at: new Date(),
        },
      });
    }

    return res.status(200).json({ status: 'success', message: 'บันทึกการกินยาเรียบร้อยแล้ว' });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'บันทึกไม่สำเร็จ' });
  }
}