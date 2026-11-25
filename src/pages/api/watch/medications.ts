import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

function getBangkokDateStr(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ status: 'error', message: `Method ${req.method} Not Allowed` });
  }

  try {
    const { takecare_id, users_id, pin } = req.query;
    let resolvedTakecareId: number | null = null;

    if (takecare_id && !Number.isNaN(Number(takecare_id))) {
      resolvedTakecareId = Number(takecare_id);
    } else if (users_id && !Number.isNaN(Number(users_id))) {
      const tc = await prisma.takecareperson.findFirst({
        where: { users_id: Number(users_id) },
        orderBy: { takecare_id: 'asc' },
      });
      if (tc) resolvedTakecareId = tc.takecare_id;
    } else if (pin && String(pin).trim()) {
      const pinNum = Number(String(pin).trim());
      if (!Number.isNaN(pinNum)) {
        const user = await prisma.users.findFirst({
          where: { users_pin: pinNum },
        });
        if (user) {
          const tc = await prisma.takecareperson.findFirst({
            where: { users_id: user.users_id },
            orderBy: { takecare_id: 'asc' },
          });
          if (tc) resolvedTakecareId = tc.takecare_id;
        }
      }
    }

    if (!resolvedTakecareId) {
      return res.status(400).json({
        status: 'error',
        message: 'กรุณาระบุ takecare_id หรือ users_id หรือ pin ให้ถูกต้อง',
      });
    }

    const todayDate = getBangkokDateStr(new Date());

    const medications = await prisma.medications.findMany({
      where: {
        takecare_id: resolvedTakecareId,
        is_active: true,
      },
      orderBy: { remind_time: 'asc' },
    });

    const logsToday = await prisma.medication_logs.findMany({
      where: {
        takecare_id: resolvedTakecareId,
        med_date: todayDate,
      },
    });

    const logMap = new Map<number, any>();
    for (const log of logsToday) {
      logMap.set(log.med_id, log);
    }

    const data = medications.map((med) => {
      const log = logMap.get(med.med_id);
      return {
        med_id: med.med_id,
        takecare_id: med.takecare_id,
        med_name: med.med_name,
        med_dosage: med.med_dosage || '',
        remind_time: med.remind_time,
        is_active: med.is_active,
        today_status: log?.status || 'NOT_DUE', // 'PENDING' | 'TAKEN' | 'MISSED' | 'NOT_DUE'
        is_taken_today: log?.status === 'TAKEN',
        taken_at: log?.taken_at || null,
      };
    });

    return res.status(200).json({
      status: 'ok',
      date: todayDate,
      takecare_id: resolvedTakecareId,
      data,
    });
  } catch (error: any) {
    console.error('GET /api/watch/medications error:', error);
    return res.status(500).json({
      status: 'error',
      message: error?.message || 'ไม่สามารถดึงรายการยาสำหรับนาฬิกาได้',
    });
  }
}