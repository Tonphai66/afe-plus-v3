import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const medId = Number(id);

  if (isNaN(medId)) {
    return res.status(400).json({ message: 'รหัสรายการยาไม่ถูกต้อง' });
  }

  if (req.method === 'PUT') {
    try {
      const { med_name, med_dosage, remind_time, is_active } = req.body;
      const updateData: any = {};
      if (med_name !== undefined) updateData.med_name = String(med_name);
      if (med_dosage !== undefined) updateData.med_dosage = String(med_dosage);
      if (remind_time !== undefined) updateData.remind_time = String(remind_time);
      if (is_active !== undefined) updateData.is_active = Boolean(is_active);

      const updated = await prisma.medications.update({
        where: { med_id: medId },
        data: updateData,
      });

      return res.status(200).json({ status: 'ok', data: updated });
    } catch (error) {
      console.error('PUT /api/medications/[id] error:', error);
      return res.status(500).json({ message: 'ไม่สามารถแก้ไขข้อมูลยาได้' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.medications.delete({
        where: { med_id: medId },
      });

      return res.status(200).json({ status: 'ok', message: 'ลบรายการยาเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('DELETE /api/medications/[id] error:', error);
      return res.status(500).json({ message: 'ไม่สามารถลบข้อมูลยาได้' });
    }
  }

  res.setHeader('Allow', ['PUT', 'DELETE']);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}