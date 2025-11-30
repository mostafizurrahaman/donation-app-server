import PDFDocument from 'pdfkit';
import {
  RECEIPT_PDF_CONFIG,
  RECEIPT_MESSAGES,
} from '../modules/Receipt/receipt.constant';
import { IReceiptPDFData } from '../modules/Receipt/receipt.interface';

/**
 * Add professional header with logo space
 */
const addHeader = (doc: PDFKit.PDFDocument, data: IReceiptPDFData): void => {
  // Company name and branding
  doc
    .fontSize(24)
    .fillColor('#1a365d')
    .text('Crescent Change', RECEIPT_PDF_CONFIG.MARGIN, 40, { align: 'left' });

  doc
    .fontSize(9)
    .fillColor('#64748b')
    .text('Tax Receipt', RECEIPT_PDF_CONFIG.MARGIN, 68, { align: 'left' });

  // Receipt details on the right
  const rightX = doc.page.width - RECEIPT_PDF_CONFIG.MARGIN - 180;
  doc
    .fontSize(10)
    .fillColor('#1e293b')
    .text('RECEIPT', rightX, 40, { align: 'right', width: 180 });

  doc
    .fontSize(9)
    .fillColor('#64748b')
    .text(`#${data.receiptNumber}`, rightX, 55, { align: 'right', width: 180 });

  doc
    .fontSize(9)
    .fillColor('#64748b')
    .text(
      new Date(data.donationDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      rightX,
      68,
      { align: 'right', width: 180 }
    );

  // Divider line
  doc
    .moveTo(RECEIPT_PDF_CONFIG.MARGIN, 95)
    .lineTo(doc.page.width - RECEIPT_PDF_CONFIG.MARGIN, 95)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke();

  doc.moveDown(3);
};

/**
 * Add organization details section
 */
const addOrganizationDetails = (
  doc: PDFKit.PDFDocument,
  data: IReceiptPDFData
): void => {
  const startY = 115;

  doc
    .fontSize(10)
    .fillColor('#64748b')
    .text('FROM', RECEIPT_PDF_CONFIG.MARGIN, startY);

  doc
    .fontSize(11)
    .fillColor('#1e293b')
    .text(data.organizationName, RECEIPT_PDF_CONFIG.MARGIN, startY + 15);

  let currentY = startY + 30;

  if (data.organizationAddress) {
    doc
      .fontSize(9)
      .fillColor('#64748b')
      .text(data.organizationAddress, RECEIPT_PDF_CONFIG.MARGIN, currentY, {
        width: 250,
      });
    currentY += 25;
  }

  if (data.organizationEmail) {
    doc
      .fontSize(9)
      .fillColor('#64748b')
      .text(data.organizationEmail, RECEIPT_PDF_CONFIG.MARGIN, currentY);
    currentY += 12;
  }

  if (data.abnNumber) {
    doc
      .fontSize(9)
      .fillColor('#64748b')
      .text(`ABN: ${data.abnNumber}`, RECEIPT_PDF_CONFIG.MARGIN, currentY);
  }
};

/**
 * Add donor details section
 */
const addDonorDetails = (
  doc: PDFKit.PDFDocument,
  data: IReceiptPDFData
): void => {
  const startY = 115;
  const rightX = doc.page.width - RECEIPT_PDF_CONFIG.MARGIN - 250;

  doc.fontSize(10).fillColor('#64748b').text('TO', rightX, startY);

  doc
    .fontSize(11)
    .fillColor('#1e293b')
    .text(data.donorName, rightX, startY + 15);

  doc
    .fontSize(9)
    .fillColor('#64748b')
    .text(data.donorEmail, rightX, startY + 30);
};

/**
 * Add donation details table
 */
const addDonationTable = (
  doc: PDFKit.PDFDocument,
  data: IReceiptPDFData
): number => {
  const tableTop = 250;
  const col1X = RECEIPT_PDF_CONFIG.MARGIN;
  const col2X = doc.page.width - RECEIPT_PDF_CONFIG.MARGIN - 200;
  const col3X = doc.page.width - RECEIPT_PDF_CONFIG.MARGIN - 100;

  // Table header background
  doc
    .rect(
      RECEIPT_PDF_CONFIG.MARGIN,
      tableTop,
      doc.page.width - RECEIPT_PDF_CONFIG.MARGIN * 2,
      25
    )
    .fillColor('#f1f5f9')
    .fill();

  // Table headers
  doc
    .fontSize(9)
    .fillColor('#475569')
    .text('DESCRIPTION', col1X, tableTop + 8)
    .text('TYPE', col2X, tableTop + 8)
    .text('AMOUNT', col3X, tableTop + 8, { align: 'right', width: 100 });

  // Table content
  let currentY = tableTop + 35;

  // Donation row
  doc.fontSize(10).fillColor('#1e293b').text('Donation', col1X, currentY);

  doc
    .fontSize(9)
    .fillColor('#64748b')
    .text(formatDonationType(data.donationType), col2X, currentY);

  doc
    .fontSize(10)
    .fillColor('#1e293b')
    .text(`${data.currency} ${data.amount.toFixed(2)}`, col3X, currentY, {
      align: 'right',
      width: 100,
    });

  currentY += 25;

  // Payment method if available
  if (data.paymentMethod) {
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(`Payment Method: ${data.paymentMethod}`, col1X, currentY);
    currentY += 20;
  }

  currentY += 10;

  // Divider line
  doc
    .moveTo(RECEIPT_PDF_CONFIG.MARGIN, currentY)
    .lineTo(doc.page.width - RECEIPT_PDF_CONFIG.MARGIN, currentY)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke();

  currentY += 15;

  // Subtotal
  doc.fontSize(9).fillColor('#64748b').text('Subtotal', col1X, currentY);

  doc
    .fontSize(10)
    .fillColor('#1e293b')
    .text(`${data.currency} ${data.amount.toFixed(2)}`, col3X, currentY, {
      align: 'right',
      width: 100,
    });

  currentY += 20;

  // Tax (if applicable)
  if (data.isTaxable && data.taxAmount > 0) {
    doc.fontSize(9).fillColor('#64748b').text('Tax', col1X, currentY);

    doc
      .fontSize(10)
      .fillColor('#1e293b')
      .text(`${data.currency} ${data.taxAmount.toFixed(2)}`, col3X, currentY, {
        align: 'right',
        width: 100,
      });

    currentY += 25;
  } else {
    currentY += 5;
  }

  // Total background
  doc
    .rect(
      doc.page.width - RECEIPT_PDF_CONFIG.MARGIN - 220,
      currentY - 5,
      220,
      30
    )
    .fillColor('#f8fafc')
    .fill();

  // Total
  doc
    .fontSize(11)
    .fillColor('#1e293b')
    .text('TOTAL', col1X, currentY + 5);

  doc
    .fontSize(14)
    .fillColor('#059669')
    .text(
      `${data.currency} ${data.totalAmount.toFixed(2)}`,
      col3X,
      currentY + 3,
      {
        align: 'right',
        width: 100,
      }
    );

  currentY += 50;

  // Tax status badges
  if (data.taxDeductible || data.zakatEligible) {
    doc.fontSize(8).fillColor('#64748b').text('Status:', col1X, currentY);

    let badgeX = col1X + 45;

    if (data.taxDeductible) {
      doc
        .roundedRect(badgeX, currentY - 3, 95, 18, 3)
        .fillAndStroke('#dcfce7', '#86efac')
        .lineWidth(1);

      doc
        .fontSize(8)
        .fillColor('#166534')
        .text('Tax Deductible', badgeX + 10, currentY + 2);

      badgeX += 105;
    }

    if (data.zakatEligible) {
      doc
        .roundedRect(badgeX, currentY - 3, 85, 18, 3)
        .fillAndStroke('#dbeafe', '#93c5fd')
        .lineWidth(1);

      doc
        .fontSize(8)
        .fillColor('#1e40af')
        .text('Zakat Eligible', badgeX + 10, currentY + 2);
    }

    currentY += 30;
  }

  return currentY;
};

/**
 * Add special message section
 */
const addSpecialMessage = (
  doc: PDFKit.PDFDocument,
  data: IReceiptPDFData,
  startY: number
): number => {
  if (!data.specialMessage) return startY;

  doc
    .roundedRect(
      RECEIPT_PDF_CONFIG.MARGIN,
      startY,
      doc.page.width - RECEIPT_PDF_CONFIG.MARGIN * 2,
      60,
      5
    )
    .fillAndStroke('#fef3c7', '#fde68a')
    .lineWidth(1);

  doc
    .fontSize(9)
    .fillColor('#92400e')
    .text('MESSAGE', RECEIPT_PDF_CONFIG.MARGIN + 15, startY + 10);

  doc
    .fontSize(9)
    .fillColor('#78350f')
    .text(data.specialMessage, RECEIPT_PDF_CONFIG.MARGIN + 15, startY + 25, {
      width: doc.page.width - RECEIPT_PDF_CONFIG.MARGIN * 2 - 30,
    });

  return startY + 75;
};

/**
 * Add footer with disclaimer
 */
const addFooter = (doc: PDFKit.PDFDocument): void => {
  const bottomY = doc.page.height - 100;

  // Thank you message
  doc
    .fontSize(12)
    .fillColor('#1a365d')
    .text(
      RECEIPT_MESSAGES.THANK_YOU_MESSAGE,
      RECEIPT_PDF_CONFIG.MARGIN,
      bottomY,
      {
        align: 'center',
        width: doc.page.width - RECEIPT_PDF_CONFIG.MARGIN * 2,
      }
    );

  // Legal disclaimer
  doc
    .fontSize(7)
    .fillColor('#94a3b8')
    .text(
      RECEIPT_MESSAGES.LEGAL_DISCLAIMER,
      RECEIPT_PDF_CONFIG.MARGIN,
      bottomY + 25,
      {
        align: 'justify',
        width: doc.page.width - RECEIPT_PDF_CONFIG.MARGIN * 2,
      }
    );

  // Footer line
  doc
    .moveTo(RECEIPT_PDF_CONFIG.MARGIN, doc.page.height - 50)
    .lineTo(doc.page.width - RECEIPT_PDF_CONFIG.MARGIN, doc.page.height - 50)
    .strokeColor('#e2e8f0')
    .lineWidth(1)
    .stroke();

  // Footer text
  doc
    .fontSize(8)
    .fillColor('#cbd5e1')
    .text(
      `Generated on ${new Date().toLocaleDateString(
        'en-US'
      )} | Crescent Change © ${new Date().getFullYear()}`,
      RECEIPT_PDF_CONFIG.MARGIN,
      doc.page.height - 35,
      {
        align: 'center',
        width: doc.page.width - RECEIPT_PDF_CONFIG.MARGIN * 2,
      }
    );
};

/**
 * Format donation type
 */
const formatDonationType = (type: string): string => {
  const typeMap: Record<string, string> = {
    'one-time': 'One-Time',
    recurring: 'Recurring',
    'round-up': 'Round-Up',
  };
  return typeMap[type] || type;
};

/**
 * Generate Receipt PDF
 */
export const generateReceiptPDF = async (
  data: IReceiptPDFData
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: RECEIPT_PDF_CONFIG.PAGE_SIZE as PDFKit.PDFDocumentOptions['size'],
        margin: RECEIPT_PDF_CONFIG.MARGIN,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Build the receipt
      addHeader(doc, data);
      addOrganizationDetails(doc, data);
      addDonorDetails(doc, data);
      const tableEndY: number = addDonationTable(doc, data);
      const messageEndY: number = addSpecialMessage(doc, data, tableEndY);
      addFooter(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
