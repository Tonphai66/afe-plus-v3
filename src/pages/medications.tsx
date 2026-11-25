import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

interface Medication {
  med_id: number;
  takecare_id: number;
  med_name: string;
  med_dosage: string;
  remind_time: string;
  is_active: boolean;
}

export default function MedicationsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [takecareData, setTakecareData] = useState<any>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [remindTime, setRemindTime] = useState('08:00');
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchUserAndMedications = useCallback(async (auToken: string) => {
    try {
      setLoading(true);
      setErrorMsg('');

      const cleanToken = auToken.includes('%') ? auToken : encodeURIComponent(auToken);

      let user: any = { users_id: 4, users_fname: 'ผู้ดูแล', users_sname: '' };
      try {
        const userRes = await axios.get(`/api/user/getUserInformation?auToken=${cleanToken}`);
        if (userRes.data?.data) user = userRes.data.data;
      } catch {
        // ข้ามไปใช้ค่าเริ่มต้น
      }
      setUserData(user);

      let takecare = user.takecareperson?.[0] || user.takecare || null;
      if (!takecare) {
        try {
          const tcRes = await axios.get(`/api/user/getUserTakecareperson/${cleanToken}`);
          takecare = tcRes.data?.data || null;
        } catch {
          takecare = {
            takecare_id: 1,
            takecare_fname: 'ผู้มีภาวะพึ่งพิง',
            takecare_sname: '',
          };
        }
      }
      setTakecareData(takecare);

      const medRes = await axios.get(
        `/api/medications?takecare_id=${takecare.takecare_id}`
      );
      setMedications(medRes.data?.data || []);
    } catch (error: any) {
      console.error('Error loading medications:', error);
      const url = error?.config?.url || '';
      const detail = error?.response?.data?.message || error?.message || '';
      setErrorMsg(`ไม่สามารถโหลดข้อมูลได้ (${detail} : ${url}) กรุณาลองเปิดลิงก์ใหม่อีกครั้ง`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const rawToken = Array.isArray(router.query.auToken)
      ? router.query.auToken[0]
      : router.query.auToken;

    if (rawToken) {
      fetchUserAndMedications(rawToken);
    } else {
      setErrorMsg('ไม่พบรหัสยืนยันตัวตน (auToken) กรุณาพิมพ์ "ตั้งเวลาการกินยา" ใน LINE เพื่อรับลิงก์ใหม่');
      setLoading(false);
    }
  }, [router.isReady, router.query.auToken, fetchUserAndMedications]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medName.trim() || !remindTime || !takecareData) return;

    try {
      setSubmitting(true);
      if (editingId) {
        await axios.put('/api/medications', {
          med_id: editingId,
          med_name: medName.trim(),
          med_dosage: medDosage.trim(),
          remind_time: remindTime,
        });
      } else {
        await axios.post('/api/medications', {
          takecare_id: takecareData.takecare_id,
          med_name: medName.trim(),
          med_dosage: medDosage.trim(),
          remind_time: remindTime,
        });
      }

      setMedName('');
      setMedDosage('');
      setRemindTime('08:00');
      setEditingId(null);

      const medRes = await axios.get(
        `/api/medications?takecare_id=${takecareData.takecare_id}`
      );
      setMedications(medRes.data?.data || []);
    } catch (error) {
      console.error('Error saving medication:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลยา');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (med: Medication) => {
    setEditingId(med.med_id);
    setMedName(med.med_name);
    setMedDosage(med.med_dosage || '');
    setRemindTime(med.remind_time);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleActive = async (med: Medication) => {
    try {
      const nextStatus = !med.is_active;
      await axios.put('/api/medications', {
        med_id: med.med_id,
        is_active: nextStatus,
      });
      setMedications((prev) =>
        prev.map((item) =>
          item.med_id === med.med_id
            ? { ...item, is_active: nextStatus }
            : item
        )
      );
    } catch (error) {
      console.error('Error toggling status:', error);
      alert('เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('ต้องการลบรายการยานี้ใช่หรือไม่?')) return;
    try {
      await axios.delete(`/api/medications?med_id=${id}`);
      setMedications((prev) => prev.filter((item) => item.med_id !== id));
    } catch (error) {
      console.error('Error deleting medication:', error);
      alert('ลบรายการยาไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f6fa', fontFamily: 'sans-serif' }}>
        <p style={{ fontSize: '18px', color: '#06C755', fontWeight: 'bold' }}></p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f6fa', padding: '20px', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', maxWidth: '400px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <p style={{ color: '#e53935', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ แจ้งเตือน</p>
          <p style={{ color: '#555', fontSize: '15px', wordBreak: 'break-word' }}>{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f6fa', paddingBottom: '40px', fontFamily: 'sans-serif' }}>
      <div style={{ backgroundColor: '#06C755', color: '#fff', padding: '20px 16px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>ตั้งเวลาแจ้งเตือนการกินยา</h1>
        <p style={{ margin: '6px 0 0', fontSize: '14px', opacity: 0.9 }}>
          ผู้ดูแล: {userData?.users_fname || ''} {userData?.users_sname || ''}
        </p>
      </div>

      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '16px' }}>
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '16px', color: '#333' }}>
            {editingId ? 'แก้ไขรายการยา' : ' เพิ่มรายการยาใหม่'}
          </h2>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>ชื่อยา *</label>
            <input
              type="text"
              required
              placeholder="เช่น พาราเซตามอล, ยาลดความดัน"
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>จำนวน / คำแนะนำ</label>
              <input
                type="text"
                placeholder="เช่น 1 เม็ด หลังอาหาร"
                value={medDosage}
                onChange={(e) => setMedDosage(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ width: '130px' }}>
              <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>เวลาแจ้งเตือน *</label>
              <input
                type="time"
                required
                value={remindTime}
                onChange={(e) => setRemindTime(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{ flex: 1, backgroundColor: '#06C755', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {submitting ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'บันทึกเวลาการกินยา'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setMedName('');
                  setMedDosage('');
                  setRemindTime('08:00');
                }}
                style={{ backgroundColor: '#eee', color: '#333', border: 'none', borderRadius: '8px', padding: '12px 16px', fontSize: '14px', cursor: 'pointer' }}
              >
                ยกเลิก
              </button>
            )}
          </div>
        </form>

        <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#333' }}>
         รายการยาทั้งหมด ({medications.length})
        </h3>

        {medications.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#888' }}>
            ยังไม่มีรายการยาที่ตั้งเวลาไว้
          </div>
        ) : (
          medications.map((med) => (
            <div
              key={med.med_id}
              style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '10px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                opacity: med.is_active ? 1 : 0.6,
                borderLeft: `5px solid ${med.is_active ? '#06C755' : '#bbb'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#06C755', marginRight: '8px' }}>
                     {med.remind_time} น.
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#222' }}>{med.med_name}</span>
                </div>
                <label style={{ fontSize: '13px', color: '#555', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={med.is_active}
                    onChange={() => handleToggleActive(med)}
                  />
                  {med.is_active ? 'เปิดเตือน' : 'ปิด'}
                </label>
              </div>

              {med.med_dosage && (
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#666' }}>
                  ขนาด/คำแนะนำ: {med.med_dosage}
                </p>
              )}

              <div style={{ marginTop: '10px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleEdit(med)}
                  style={{ background: 'none', border: 'none', color: '#1976d2', fontSize: '14px', cursor: 'pointer', padding: 0 }}
                >
                   แก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(med.med_id)}
                  style={{ background: 'none', border: 'none', color: '#e53935', fontSize: '14px', cursor: 'pointer', padding: 0 }}
                >
                   ลบ
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}