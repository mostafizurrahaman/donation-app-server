import PDFDocument from 'pdfkit';
import {
  RECEIPT_PDF_CONFIG,
  RECEIPT_MESSAGES,
} from '../modules/Receipt/receipt.constant';
import { IReceiptPDFData } from '../modules/Receipt/receipt.interface';

/**
 * Add header to PDF
 */
const addHeader = (doc: PDFKit.PDFDocument): void => {
  doc
    .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.HEADING)
    .fillColor(RECEIPT_PDF_CONFIG.COLORS.ACCENT)
    .text('Crescent Change', RECEIPT_PDF_CONFIG.MARGIN, 40, { align: 'left' });

  doc
    .moveTo(RECEIPT_PDF_CONFIG.MARGIN, 65)
    .lineTo(doc.page.width - RECEIPT_PDF_CONFIG.MARGIN, 65)
    .strokeColor(RECEIPT_PDF_CONFIG.COLORS.BORDER)
    .stroke();
  doc.moveDown(2);
};

/**
 * Add section title to PDF
 */
const addSection = (doc: PDFKit.PDFDocument, title: string): void => {
  doc
    .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.SUBHEADING)
    .fillColor(RECEIPT_PDF_CONFIG.COLORS.SECONDARY)
    .text(title, { underline: true });

  doc.moveDown(0.5);
};

/**
 * Add field to PDF
 */
const addField = (
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  highlight: boolean = false
): void => {
  const fontSize = highlight
    ? RECEIPT_PDF_CONFIG.FONT_SIZE.SUBHEADING
    : RECEIPT_PDF_CONFIG.FONT_SIZE.BODY;

  const color = highlight
    ? RECEIPT_PDF_CONFIG.COLORS.SUCCESS
    : RECEIPT_PDF_CONFIG.COLORS.TEXT;

  doc
    .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.BODY)
    .fillColor(RECEIPT_PDF_CONFIG.COLORS.LIGHT_TEXT)
    .text(`${label}: `, { continued: true })
    .fontSize(fontSize)
    .fillColor(color)
    .text(value);

  doc.moveDown(0.3);
};

/**
 * Add badge to PDF
 */
const addBadge = (
  doc: PDFKit.PDFDocument,
  text: string,
  color: string
): void => {
  const x = doc.x;
  const y = doc.y;

  doc
    .roundedRect(x, y, 120, 25, 5)
    .fillAndStroke(color, color)
    .fillColor('#FFFFFF')
    .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.SMALL)
    .text(text, x, y + 7, { width: 120, align: 'center' });

  doc.moveDown(1);
};

/**
 * Add legal disclaimer to PDF
 */
const addLegalDisclaimer = (doc: PDFKit.PDFDocument): void => {
  doc
    .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.SMALL)
    .fillColor(RECEIPT_PDF_CONFIG.COLORS.LIGHT_TEXT)
    .text(RECEIPT_MESSAGES.LEGAL_DISCLAIMER, { align: 'justify', width: 500 });

  doc.moveDown(1);
};

/**
 * Add thank you message to PDF
 */
const addThankYouMessage = (doc: PDFKit.PDFDocument): void => {
  doc
    .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.BODY)
    .fillColor(RECEIPT_PDF_CONFIG.COLORS.ACCENT)
    .text(RECEIPT_MESSAGES.THANK_YOU_MESSAGE, { align: 'center' });

  doc.moveDown(1);
};

/**
 * Add footer to PDF
 */
const addFooter = (doc: PDFKit.PDFDocument): void => {
  const bottomMargin = 50;
  const pageHeight = doc.page.height;

  doc
    .moveTo(RECEIPT_PDF_CONFIG.MARGIN, pageHeight - bottomMargin - 20)
    .lineTo(
      doc.page.width - RECEIPT_PDF_CONFIG.MARGIN,
      pageHeight - bottomMargin - 20
    )
    .strokeColor(RECEIPT_PDF_CONFIG.COLORS.BORDER)
    .stroke();

  doc
    .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.SMALL)
    .fillColor(RECEIPT_PDF_CONFIG.COLORS.LIGHT_TEXT)
    .text(
      `Generated on ${new Date().toLocaleDateString(
        'en-US'
      )} | Crescent Change © ${new Date().getFullYear()}`,
      RECEIPT_PDF_CONFIG.MARGIN,
      pageHeight - bottomMargin,
      { align: 'center' }
    );
};

/**
 * Format donation type
 */
const formatDonationType = (type: string): string => {
  const typeMap: Record<string, string> = {
    'one-time': 'One-Time Donation',
    recurring: 'Recurring Donation',
    'round-up': 'Round-Up Donation',
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

      // Add header
      addHeader(doc);

      // Title
      doc
        .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.TITLE)
        .fillColor(RECEIPT_PDF_CONFIG.COLORS.PRIMARY)
        .text('Donation Receipt', { align: 'center' });

      doc.moveDown(0.5);
      doc
        .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.BODY)
        .fillColor(RECEIPT_PDF_CONFIG.COLORS.LIGHT_TEXT)
        .text(`Receipt Number: ${data.receiptNumber}`, { align: 'center' });

      doc.moveDown(2);

      // Organization Details
      addSection(doc, 'Organization Details');
      addField(doc, 'Organization Name', data.organizationName);
      if (data.organizationAddress)
        addField(doc, 'Address', data.organizationAddress);
      if (data.organizationEmail)
        addField(doc, 'Email', data.organizationEmail);
      if (data.abnNumber) addField(doc, 'ABN', data.abnNumber);

      doc.moveDown(1);

      // Donor Details
      addSection(doc, 'Donor Details');
      addField(doc, 'Donor Name', data.donorName);
      addField(doc, 'Email', data.donorEmail);

      doc.moveDown(1);

      // Donation Details
      addSection(doc, 'Donation Details');
      addField(
        doc,
        'Amount',
        `${data.currency} ${data.amount.toFixed(2)}`,
        true
      );
      addField(doc, 'Donation Type', formatDonationType(data.donationType));
      addField(
        doc,
        'Date',
        new Date(data.donationDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      );
      if (data.paymentMethod)
        addField(doc, 'Payment Method', data.paymentMethod);

      doc.moveDown(1);

      // Tax Status
      addSection(doc, 'Tax Status');
      if (data.taxDeductible)
        addBadge(doc, 'Tax Deductible', RECEIPT_PDF_CONFIG.COLORS.SUCCESS);
      if (data.zakatEligible)
        addBadge(doc, 'Zakat Eligible', RECEIPT_PDF_CONFIG.COLORS.ACCENT);

      doc.moveDown(1);

      // Special Message
      if (data.specialMessage) {
        addSection(doc, 'Your Message');
        doc
          .fontSize(RECEIPT_PDF_CONFIG.FONT_SIZE.BODY)
          .fillColor(RECEIPT_PDF_CONFIG.COLORS.TEXT)
          .text(data.specialMessage, { width: 500 });

        doc.moveDown(1);
      }

      // Legal & Thank You
      addLegalDisclaimer(doc);
      addThankYouMessage(doc);
      addFooter(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
