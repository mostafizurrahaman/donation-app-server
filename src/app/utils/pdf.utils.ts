import PDFDocument from 'pdfkit';
import { IReceiptPDFData } from '../modules/Receipt/receipt.interface';

/**
 * Generates a PDF Receipt Buffer with Australian Fee Breakdown
 */
export const generateReceiptPDF = (data: IReceiptPDFData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    // --- HEADER ---
    doc
      .fillColor('#444444')
      .fontSize(20)
      .text('OFFICIAL DONATION RECEIPT', 110, 57)
      .fontSize(10)
      .text('Crescent Change Platform', 200, 65, { align: 'right' })
      .moveDown();

    // --- RECEIPT DETAILS ---
    doc
      .fontSize(10)
      .text(`Receipt Number: ${data.receiptNumber}`, 50, 100)
      .text(
        `Date: ${new Date(data.donationDate).toLocaleDateString('en-AU')}`,
        50,
        115
      )
      .text(`Payment Method: ${data.paymentMethod || 'Card'}`, 50, 130)
      .moveDown();

    // --- DONOR & ORGANIZATION ---
    const startY = 160;

    doc
      .text('ISSUED TO:', 50, startY, { underline: true })
      .font('Helvetica-Bold')
      .text(data.donorName, 50, startY + 15)
      .font('Helvetica')
      .text(data.donorEmail, 50, startY + 30);

    doc
      .text('RECIPIENT ORGANIZATION:', 300, startY, { underline: true })
      .font('Helvetica-Bold')
      .text(data.organizationName, 300, startY + 15)
      .font('Helvetica')
      .text(data.organizationAddress || '', 300, startY + 30);

    if (data.abnNumber) {
      doc.text(`ABN: ${data.abnNumber}`, 300, startY + 45);
    }

    // --- FINANCIAL TABLE ---
    let tableTop = 260;
    const currencySymbol = data.currency.toUpperCase() === 'USD' ? '$' : 'A$';

    doc.font('Helvetica-Bold');
    generateTableRow(doc, tableTop, 'Description', 'Amount');
    generateHr(doc, tableTop + 20);
    doc.font('Helvetica');

    // 1. Base Donation
    tableTop += 30;
    generateTableRow(
      doc,
      tableTop,
      'Donation Amount (Tax Deductible)',
      formatCurrency(data.amount, currencySymbol)
    );

    // 2. Fees Section
    if (data.coverFees && (data.platformFee > 0 || data.stripeFee > 0)) {
      if (data.platformFee > 0) {
        tableTop += 25;
        generateTableRow(
          doc,
          tableTop,
          'Platform & Service Fee',
          formatCurrency(data.platformFee, currencySymbol)
        );
      }
      if (data.stripeFee > 0) {
        tableTop += 25;
        generateTableRow(
          doc,
          tableTop,
          'Transaction Fee (Stripe)',
          formatCurrency(data.stripeFee, currencySymbol)
        );
      }
      if (data.gstOnFee > 0) {
        tableTop += 25;
        generateTableRow(
          doc,
          tableTop,
          'GST (10% on Platform Fees)',
          formatCurrency(data.gstOnFee, currencySymbol)
        );
      }
    } else {
      // Fees deducted from the donation
      if (data.platformFee > 0) {
        tableTop += 25;
        generateTableRow(
          doc,
          tableTop,
          'Platform & Service Fee (Deducted)',
          `-${formatCurrency(data.platformFee, currencySymbol)}`
        );
      }
      if (data.stripeFee > 0) {
        tableTop += 25;
        generateTableRow(
          doc,
          tableTop,
          'Transaction Fee (Stripe) (Deducted)',
          `-${formatCurrency(data.stripeFee, currencySymbol)}`
        );
      }
      if (data.gstOnFee > 0) {
        tableTop += 25;
        generateTableRow(
          doc,
          tableTop,
          'GST (10% on Platform Fees) (Deducted)',
          `-${formatCurrency(data.gstOnFee, currencySymbol)}`
        );
      }
    }

    // 3. Total Paid by Donor
    tableTop += 35;
    generateHr(doc, tableTop - 10);
    doc.font('Helvetica-Bold');
    generateTableRow(
      doc,
      tableTop,
      'TOTAL PAID BY DONOR',
      formatCurrency(data.totalAmount, currencySymbol)
    );

    // --- NEW SECTION: AMOUNT RECEIVED BY ORG ---
    // Calculation: Total Paid - (Platform Fee + Stripe Fee + GST)
    const netReceived =
      data.totalAmount - (data.platformFee + data.stripeFee + data.gstOnFee);

    tableTop += 25;
    doc.font('Helvetica-BoldOblique').fillColor('#2e7d32'); // Dark green color for clarity
    generateTableRow(
      doc,
      tableTop,
      'NET AMOUNT TO ORGANIZATION',
      formatCurrency(netReceived, currencySymbol)
    );
    doc.fillColor('#444444').font('Helvetica'); // Reset style

    // --- FOOTER ---
    const footerTop = 520; // Adjusted slightly down

    if (data.taxDeductible) {
      doc
        .fontSize(10)
        .text(
          'Donations of $2 or more to this organization are tax-deductible in Australia.',
          50,
          footerTop,
          { align: 'center', width: 500 }
        );
    }

    doc
      .fontSize(8)
      .fillColor('#888888')
      .text(
        'This receipt is generated electronically by Crescent Change. For support, contact support@crescentchange.com',
        50,
        footerTop + 30,
        { align: 'center', width: 500 }
      );

    doc.end();
  });
};

// --- HELPER FUNCTIONS ---

function generateTableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  item: string,
  price: string
) {
  doc
    .fontSize(10)
    .text(item, 50, y)
    .text(price, 0, y, { align: 'right', width: 540 });
}

function generateHr(doc: PDFKit.PDFDocument, y: number) {
  doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
}

function formatCurrency(amount: number, symbol: string) {
  return `${symbol}${Math.max(0, amount).toFixed(2)}`;
}
