import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import prisma from '@/lib/prisma';

function getBangkokDateStr(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getBangkokTimeStr(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const now = new Date();
    const todayStr = getBangkokDateStr(now);
    const currentTime = getBangkokTimeStr(now); // เช่น "14:30"

    const channelAccessToken =
      process.env.CHANNEL_ACCESS_TOKEN_LINE || process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!channelAccessToken) {
      return res.status(500).json({ status: 'error', message: 'ไม่พบ LINE Channel Access Token' });
    }

    const dueMeds = await prisma.medications.findMany({
      where: {
        is_active: true,
        remind_time: currentTime,
      },
    });

    let sentCount = 0;

    for (const med of dueMeds) {
      const existingLog = await prisma.medication_logs.findFirst({
        where: {
          med_id: med.med_id,
          med_date: todayStr,
        },
      });

      // ข้ามถ้ากินยาแล้ว หรือเคยแจ้งเตือนไปแล้ววันนี้
      if (existingLog && (existingLog.status === 'TAKEN' || existingLog.notified_caretaker)) {
        continue;
      }

      const takecare = await prisma.takecareperson.findFirst({
        where: { takecare_id: med.takecare_id },
      });
      const user = takecare?.users_id
        ? await prisma.users.findFirst({ where: { users_id: takecare.users_id } })
        : null;

      if (!user?.users_line_id) continue;

      const elderName =
        `${takecare?.takecare_fname || ''} ${takecare?.takecare_sname || ''}`.trim() ||
        'ผู้มีภาวะพึ่งพิง';

      const dosageText = med.med_dosage
        ? /^\d+(\.\d+)?$/.test(med.med_dosage.trim())
          ? `${med.med_dosage.trim()} เม็ด`
          : med.med_dosage
        : '-';

      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: user.users_line_id,
          messages: [
            {
              type: 'flex',
              altText: `ถึงเวลากินยา: ${med.med_name} (${elderName}) เวลา ${med.remind_time} น.`,
              contents: {
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: 'ถึงเวลารับประทานยา',
                      weight: 'bold',
                      size: 'xl',
                      color: '#0000FF',
                    },
                    {
                      type: 'box',
                      layout: 'vertical',
                      spacing: 'sm',
                      margin: 'md',
                      contents: [
                        {
                          type: 'box',
                          layout: 'baseline',
                          spacing: 'sm',
                          contents: [
                            { type: 'text', text: 'ชื่อ', color: '#555555', size: 'sm', flex: 2 },
                            { type: 'text', text: elderName, color: '#111111', size: 'sm', weight: 'bold', flex: 3, wrap: true },
                          ],
                        },
                        {
                          type: 'box',
                          layout: 'baseline',
                          spacing: 'sm',
                          contents: [
                            { type: 'text', text: 'ชื่อยา', color: '#555555', size: 'sm', flex: 2 },
                            { type: 'text', text: med.med_name, color: '#111111', size: 'sm', flex: 3, wrap: true },
                          ],
                        },
                        {
                          type: 'box',
                          layout: 'baseline',
                          spacing: 'sm',
                          contents: [
                            { type: 'text', text: 'จำนวนยา', color: '#555555', size: 'sm', flex: 2 },
                            { type: 'text', text: dosageText, color: '#111111', size: 'sm', flex: 3, wrap: true },
                          ],
                        },
                        {
                          type: 'box',
                          layout: 'baseline',
                          spacing: 'sm',
                          contents: [
                            { type: 'text', text: 'เวลาที่กำหนด', color: '#555555', size: 'sm', flex: 2 },
                            { type: 'text', text: `${med.remind_time} น.`, color: '#111111', size: 'sm', flex: 3, wrap: true },
                          ],
                        },
                        {
                          type: 'box',
                          layout: 'baseline',
                          spacing: 'sm',
                          contents: [
                            { type: 'text', text: 'สถานะ', color: '#555555', size: 'sm', flex: 2 },
                            { type: 'text', text: 'รอรับประทานยา', color: '#EA580C', size: 'sm', weight: 'bold', flex: 3, wrap: true },
                          ],
                        },
                      ],
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

      // บันทึกว่าแจ้งเตือนไปแล้ว เพื่อไม่ให้ส่งซ้ำ
      if (existingLog) {
        await prisma.medication_logs.update({
          where: { log_id: existingLog.log_id },
          data: { notified_caretaker: true },
        });
      } else {
        await prisma.medication_logs.create({
          data: {
            med_id: med.med_id,
            takecare_id: med.takecare_id,
            med_date: todayStr,
            status: 'PENDING',
            notified_caretaker: true,
          },
        });
      }

      sentCount++;
    }

    return res.status(200).json({
      status: 'ok',
      checkedTime: currentTime,
      sentCount,
    });
  } catch (error: any) {
    console.error('GET /api/medications/remind error:', error);
    return res.status(500).json({ status: 'error', message: error?.message });
  }
}