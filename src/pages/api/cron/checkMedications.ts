import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import prisma from '@/lib/prisma';
import { encrypt } from '@/utils/helpers';

function getBangkokDateTimeParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const hour = map.hour === '24' ? '00' : map.hour;
  const minute = map.minute;

  return {
    todayDate: `${map.year}-${map.month}-${map.day}`,
    currentTime: `${hour}:${minute}`,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ status: 'error', message: `Method ${req.method} Not Allowed` });
  }

  // ถ้าตั้ง CRON_SECRET ไว้ใน Environment Variables ให้ตรวจสอบ Authorization Header หรือ query key
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    const queryKey = typeof req.query.key === 'string' ? req.query.key : '';
    const isValidBearer = authHeader === `Bearer ${cronSecret}`;
    const isValidQuery = queryKey === cronSecret;

    if (!isValidBearer && !isValidQuery) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized cron request' });
    }
  }

  try {
    const { todayDate, currentTime } = getBangkokDateTimeParts(new Date());

    const dueMeds = await prisma.medications.findMany({
      where: {
        is_active: true,
        remind_time: currentTime,
      },
      orderBy: { med_id: 'asc' },
    });

    if (dueMeds.length === 0) {
      return res.status(200).json({
        status: 'ok',
        date: todayDate,
        time: currentTime,
        notified: 0,
        message: 'ไม่มีรายการยาที่ครบกำหนดแจ้งเตือนในเวลานี้',
      });
    }

    const webDomain = (
      process.env.WEB_DOMAIN ||
      process.env.WEB_API_URL ||
      'https://afe-plus-v3-production.up.railway.app'
    ).replace(/\/+$/, '');

    const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN_LINE;
    let notifiedCount = 0;
    const skipped: Array<{ med_id: number; reason: string }> = [];

    for (const med of dueMeds) {
      const existingLog = await prisma.medication_logs.findFirst({
        where: {
          med_id: med.med_id,
          med_date: todayDate,
        },
      });

      if (existingLog) {
        skipped.push({ med_id: med.med_id, reason: 'already_logged_today' });
        continue;
      }

      const takecare = await prisma.takecareperson.findFirst({
        where: { takecare_id: med.takecare_id },
      });

      if (!takecare?.users_id) {
        skipped.push({ med_id: med.med_id, reason: 'takecare_or_user_not_found' });
        continue;
      }

      const user = await prisma.users.findFirst({
        where: { users_id: takecare.users_id },
      });

      const lineUserId = user?.users_line_id;
      if (!lineUserId) {
        skipped.push({ med_id: med.med_id, reason: 'line_user_id_missing' });
        continue;
      }

      const rawEncrypted = encrypt(String(user.users_id));
      const encodedToken = rawEncrypted.includes('%')
        ? rawEncrypted
        : encodeURIComponent(rawEncrypted);
      const medicationUrl = `${webDomain}/medications?auToken=${encodedToken}`;

      const elderName =
        `${takecare.takecare_fname || ''} ${takecare.takecare_sname || ''}`.trim() ||
        'ผู้มีภาวะพึ่งพิง';

      let sentToLine = false;
      if (channelAccessToken) {
        await axios.post(
          'https://api.line.me/v2/bot/message/push',
          {
            to: lineUserId,
            messages: [
              {
                type: 'flex',
                altText: `⏰ ถึงเวลากินยา: ${med.med_name} (${med.remind_time} น.)`,
                contents: {
                  type: 'bubble',
                  size: 'kilo',
                  header: {
                    type: 'box',
                    layout: 'vertical',
                    backgroundColor: '#06C755',
                    paddingAll: '14px',
                    contents: [
                      {
                        type: 'text',
                        text: '⏰ ถึงเวลากินยาแล้ว',
                        weight: 'bold',
                        color: '#FFFFFF',
                        size: 'md',
                      },
                    ],
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'sm',
                    contents: [
                      {
                        type: 'text',
                        text: `💊 ${med.med_name}`,
                        weight: 'bold',
                        size: 'lg',
                        color: '#111111',
                        wrap: true,
                      },
                      {
                        type: 'text',
                        text: `ผู้มีภาวะพึ่งพิง: ${elderName}`,
                        size: 'sm',
                        color: '#555555',
                        wrap: true,
                      },
                      {
                        type: 'text',
                        text: `เวลาแจ้งเตือน: ${med.remind_time} น.`,
                        size: 'sm',
                        color: '#555555',
                      },
                      ...(med.med_dosage
                        ? [
                            {
                              type: 'text',
                              text: `ขนาด/คำแนะนำ: ${med.med_dosage}`,
                              size: 'sm',
                              color: '#555555',
                              wrap: true,
                            },
                          ]
                        : []),
                    ],
                  },
                  footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'button',
                        style: 'primary',
                        color: '#06C755',
                        action: {
                          type: 'uri',
                          label: 'เปิดหน้าจัดการยา',
                          uri: medicationUrl,
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${channelAccessToken}`,
            },
          }
        );
        sentToLine = true;
      }

      await prisma.medication_logs.create({
        data: {
          med_id: med.med_id,
          takecare_id: med.takecare_id,
          med_date: todayDate,
          status: 'PENDING',
          notified_caretaker: sentToLine,
        },
      });

      if (sentToLine) {
        notifiedCount++;
      } else {
        skipped.push({ med_id: med.med_id, reason: 'missing_channel_access_token' });
      }
    }

    return res.status(200).json({
      status: 'ok',
      date: todayDate,
      time: currentTime,
      notified: notifiedCount,
      skipped,
    });
  } catch (error: any) {
    console.error('Cron checkMedications error:', error);
    return res.status(500).json({
      status: 'error',
      message: error?.message || 'เกิดข้อผิดพลาดในการตรวจสอบเวลาแจ้งเตือน',
    });
  }
}