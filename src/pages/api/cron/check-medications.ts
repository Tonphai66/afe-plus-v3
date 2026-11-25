/* eslint-disable */
// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const now = new Date();
  const bangkokTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const today = bangkokTime.toLocaleDateString('en-CA');
  const currentMinutes = bangkokTime.getHours() * 60 + bangkokTime.getMinutes();

  try {
    const activeMeds = await prisma.medications.findMany({
      where: { is_active: true },
      include: {
        logs: { where: { med_date: today } },
      },
    });

    let alertedCount = 0;

    for (const med of activeMeds) {
      const [h, m] = med.remind_time.split(':').map(Number);
      const remindMinutes = h * 60 + m;

      if (currentMinutes - remindMinutes >= 30) {
        const log = med.logs[0];

        if (!log || (log.status !== 'TAKEN' && !log.notified_caretaker)) {
          if (log) {
            await prisma.medication_logs.update({
              where: { log_id: log.log_id },
              data: { status: 'MISSED', notified_caretaker: true },
            });
          } else {
            await prisma.medication_logs.create({
              data: {
                med_id: med.med_id,
                takecare_id: med.takecare_id,
                med_date: today,
                status: 'MISSED',
                notified_caretaker: true,
              },
            });
          }

          // ค้นหาข้อมูลผู้มีภาวะพึ่งพิงและ LINE ID ของผู้ดูแลจากตารางเดิมในระบบ
          const person = await prisma.takecareperson.findUnique({
            where: { takecare_id: med.takecare_id },
            include: { users: true },
          });

          const lineUserId = person?.users?.users_line_id;
          const personName = person ? `${person.takecare_fname} ${person.takecare_lname}` : 'ผู้มีภาวะพึ่งพิง';
          const token = process.env.CHANNEL_ACCESS_TOKEN_LINE;

          if (token && lineUserId) {
            await axios.post(
              'https://api.line.me/v2/bot/message/push',
              {
                to: lineUserId,
                messages: [
                  {
                    type: 'text',
                    text: `⚠️ แจ้งเตือนลืมกินยา!\nคุณ${personName} ยังไม่ได้กดยืนยันการกินยา "${med.med_name}" (${med.med_dosage}) เวลา ${med.remind_time} น. (เลยเวลามากกว่า 30 นาทีแล้ว) กรุณาโทรติดตามด้วยครับ`,
                  },
                ],
              },
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            alertedCount++;
          }
        }
      }
    }

    return res.status(200).json({ status: 'checked', alertedCount });
  } catch (error) {
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบเวลา' });
  }
}