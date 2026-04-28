import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';

export async function POST(request: NextRequest) {
  try {
    const { tasks, format } = await request.json();

  if (format === 'csv') {
    const csv = generateCSV(tasks);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="emk-tasks-${Date.now()}.csv"`,
      },
    });
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));

    doc.fontSize(18).text('Трекер задач ЕМК', { align: 'left' });
    doc.fontSize(10).fillColor('#94a3b8').text(`Экспорт от ${new Date().toLocaleDateString('ru-RU')}`);
    doc.moveDown(1.5);

    const cols = ['Задача', 'Статус', 'Приоритет', 'Исполнитель', 'План (ч)', 'Факт (ч)'];
    const colWidths = [250, 100, 80, 130, 70, 70];
    let x = 30;
    let y = doc.y;

    cols.forEach((col, i) => {
      doc.fontSize(10).fillColor('#475569').text(col, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });

    doc.moveTo(30, y + 15).lineTo(800, y + 15).strokeColor('#e2e8f0').lineWidth(1).stroke();
    y += 22;

    tasks.forEach((task: Record<string, string | number>, index: number) => {
      if (y > 520) {
        doc.addPage();
        y = 30;
      }
      x = 30;
      if (index % 2 === 0) {
        doc.rect(30, y - 4, 770, 22).fill('#f8fafc');
      }
      const values = [task.title, task.status, task.priority, task.assignee, task.planHours, task.factHours];
      values.forEach((val, i) => {
        doc.fontSize(9).fillColor('#334155').text(String(val ?? ''), x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });
      y += 22;
    });

    doc.end();

    return new Promise<NextResponse>((resolve) => {
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(new NextResponse(buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="emk-tasks-${Date.now()}.pdf"`,
          },
        }));
      });
    });
  }

  return NextResponse.json({ error: 'Unknown format' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function escapeCSVValue(value: string): string {
  const str = String(value ?? '');
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCSV(tasks: Record<string, string | number>[]): string {
  const BOM = '\uFEFF';
  const header = 'Задача;Статус;Приоритет;Исполнитель;План (ч);Факт (ч)';
  const rows = tasks.map(t =>
    [t.title, t.status, t.priority, t.assignee, t.planHours, t.factHours]
      .map(v => escapeCSVValue(String(v ?? '')))
      .join(';')
  );
  return BOM + [header, ...rows].join('\n');
}