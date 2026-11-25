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
  if (req.method === 'GET') {
    try {
      const { takecare_id } = req.query;
      const whereClause: any = {};
      if (takecare_id) whereClause.takecare_id = Number(takecare_id);

      const medications = await prisma.medications.findMany({
        where: whereClause,
        orderBy: { remind_time: 'asc' },
      });

      return res.status(200).json({ status: 'ok', data: medications });
    } catch (error) {
      console.error('GET /api/medications error:', error);
      return res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลยาได้' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { takecare_id, med_name, med_dosage, remind_time } = req.body;
      if (!takecare_id || !med_name || !remind_time) {
        return res.status(400).json({ message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
      }

      const newMed = await prisma.medications.create({
        data: {
          takecare_id: Number(takecare_id),
          med_name: String(med_name),
          med_dosage: med_dosage ? String(med_dosage) : '',
          remind_time: String(remind_time),
          is_active: true,
        },
      });

      return res.status(201).json({ status: 'ok', data: newMed });
    } catch (error) {
      console.error('POST /api/medications error:', error);
      return res.status(500).json({ message: 'ไม่สามารถบันทึกข้อมูลยาได้' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { med_id, med_name, med_dosage, remind_time, is_active } = req.body;
      const id = Number(med_id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'รหัสรายการยาไม่ถูกต้อง' });
      }

      const updateData: any = {};
      if (med_name !== undefined) updateData.med_name = String(med_name);
      if (med_dosage !== undefined) updateData.med_dosage = String(med_dosage);
      if (remind_time !== undefined) updateData.remind_time = String(remind_time);
      if (is_active !== undefined) updateData.is_active = Boolean(is_active);

      const updated = await prisma.medications.update({
        where: { med_id: id },
        data: updateData,
      });

      // ถ้ามีการแก้ไขเวลา ให้รีเซ็ตสถานะการกินยาของวันนี้ เพื่อใช้รายการเดิมซ้ำได้ทันที
      if (remind_time !== undefined) {
        const todayStr = getBangkokDateStr(new Date());
        await prisma.medication_logs.deleteMany({
          where: {
            med_id: id,
            med_date: todayStr,
          },
        });
      }

      return res.status(200).json({ status: 'ok', data: updated });
    } catch (error) {
      console.error('PUT /api/medications error:', error);
      return res.status(500).json({ message: 'ไม่สามารถแก้ไขข้อมูลยาได้' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const id = Number(req.query.med_id);
      if (isNaN(id)) {
        return res.status(400).json({ message: 'รหัสรายการยาไม่ถูกต้อง' });
      }

      await prisma.medications.delete({
        where: { med_id: id },
      });

      return res.status(200).json({ status: 'ok', message: 'ลบรายการยาเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('DELETE /api/medications error:', error);
      return res.status(500).json({ message: 'ไม่สามารถลบข้อมูลยาได้' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}