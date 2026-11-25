import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
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

function getBangkokTimeStr(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date); // HH:mm
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ status: 'error', message: `Method ${req.method} Not Allowed` });
  }

  try {
    const { med_id, takecare_id, med_date, notify_line } = req.body;
    const medIdNum = Number(med_id);

    if (Number.isNaN(medIdNum) || medIdNum <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'รหัสรายการยา (med_id) ไม่ถูกต้อง',
      });
    }

    const med = await prisma.medications.findFirst({
      where: { med_id: medIdNum },
    });

    if (!med) {
      return res.status(404).json({
        status: 'error',
        message: 'ไม่พบรายการยานี้ในระบบ',
      });
    }

    const resolvedTakecareId =
      takecare_id && !Number.isNaN(Number(takecare_id))
        ? Number(takecare_id)
        : med.takecare_id;

    const targetDate =
      typeof med_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(med_date.trim())
        ? med_date.trim()
        : getBangkokDateStr(new Date());

    const now = new Date();

    const existingLog = await prisma.medication_logs.findFirst({
      where: {
        med_id: med.med_id,
        med_date: targetDate,
      },
      orderBy: { log_id: 'desc' },
    });

    let savedLog;
    if (existingLog) {
      savedLog = await prisma.medication_logs.update({
        where: { log_id: existingLog.log_id },
        data: {
          status: 'TAKEN',
          taken_at: now,
        },
      });
    } else {
      savedLog = await prisma.medication_logs.create({
        data: {
          med_id: med.med_id,
          takecare_id: resolvedTakecareId,
          med_date: targetDate,
          status: 'TAKEN',
          taken_at: now,
          notified_caretaker: false,
        },
      });
    }

    const shouldNotify = notify_line !== false;
    const channelAccessToken =
      process.env.CHANNEL_ACCESS_TOKEN_LINE || process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (shouldNotify && channelAccessToken) {
      try {
        const takecare = await prisma.takecareperson.findFirst({
          where: { takecare_id: resolvedTakecareId },
        });
        const user = takecare?.users_id
          ? await prisma.users.findFirst({ where: { users_id: takecare.users_id } })
          : null;

        if (user?.users_line_id) {
          const elderName =
            `${takecare?.takecare_fname || ''} ${takecare?.takecare_sname || ''}`.trim() ||
            'ผู้มีภาวะพึ่งพิง';
          const takenTime = getBangkokTimeStr(now);

          const detailRows: any[] = [
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
          ];

          if (med.med_dosage) {
            const dosageText = /^\d+(\.\d+)?$/.test(med.med_dosage.trim())
              ? `${med.med_dosage.trim()} เม็ด`
              : med.med_dosage;

            detailRows.push({
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'จำนวนยา', color: '#555555', size: 'sm', flex: 2 },
                { type: 'text', text: dosageText, color: '#111111', size: 'sm', flex: 3, wrap: true },
              ],
            });
          }

          detailRows.push(
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'เวลาที่กิน', color: '#555555', size: 'sm', flex: 2 },
                { type: 'text', text: `${takenTime} น.`, color: '#111111', size: 'sm', flex: 3, wrap: true },
              ],
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'สถานะ', color: '#555555', size: 'sm', flex: 2 },
                { type: 'text', text: 'กินยาแล้ว', color: '#16A34A', size: 'sm', weight: 'bold', flex: 3, wrap: true },
              ],
            }
          );

          await axios.post(
            'https://api.line.me/v2/bot/message/push',
            {
              to: user.users_line_id,
              messages: [
                {
                  type: 'flex',
                  altText: `ยืนยันการรับประทานยา: ${med.med_name} (${elderName}) เวลา ${takenTime} น.`,
                  contents: {
                    type: 'bubble',
                    body: {
                      type: 'box',
                      layout: 'vertical',
                      spacing: 'md',
                      contents: [
                        {
                          type: 'text',
                          text: 'ยืนยันการรับประทานยา',
                          weight: 'bold',
                          size: 'xl',
                          color: '#0000FF',
                        },
                        {
                          type: 'box',
                          layout: 'vertical',
                          spacing: 'sm',
                          margin: 'md',
                          contents: detailRows,
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
          console.log('[Watch Confirm] ส่ง LINE Flex Message สำเร็จ!');
        }
      } catch (lineErr: any) {
        console.error(
          'Failed to send LINE taken confirmation:',
          lineErr?.response?.data || lineErr?.message
        );
      }
    }

    return res.status(200).json({
      status: 'ok',
      message: 'บันทึกการกินยาเรียบร้อยแล้ว',
      data: savedLog,
    });
  } catch (error: any) {
    console.error('POST /api/watch/medications/confirm error:', error);
    return res.status(500).json({
      status: 'error',
      message: error?.message || 'ไม่สามารถบันทึกการกินยาได้',
    });
  }
}