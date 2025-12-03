import nodemailer from 'nodemailer';
import config from '../config';

interface ISendReceiptEmailPayload {
  donorEmail: string;
  donorName: string;
  organizationName: string;
  receiptNumber: string;

  // Financials
  amount: number; // Base Donation
  totalAmount: number; // Total Paid

  // Fee Breakdown (Optional, as legacy calls might not have them yet)
  coverFees?: boolean;
  platformFee?: number;
  gstOnFee?: number;

  currency: string;
  donationDate: Date;
  pdfUrl: string;
  donationType: string;
  specialMessage?: string;

  // Legacy compatibility
  isTaxable?: boolean;
  taxAmount?: number;
}

const sendReceiptEmail = async (payload: ISendReceiptEmailPayload) => {
  const {
    donorEmail,
    donorName,
    organizationName,
    receiptNumber,
    amount,
    totalAmount,
    coverFees = false,
    platformFee = 0,
    gstOnFee = 0,
    currency,
    donationDate,
    pdfUrl,
    donationType,
  } = payload;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Or your SMTP host
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.email.nodemailerEmail,
      pass: config.email.nodemailerPassword,
    },
  });

  // Format Date
  const formattedDate = new Date(donationDate).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Calculate Display Values
  const currencySymbol = currency.toUpperCase() === 'USD' ? '$' : 'A$';

  // ---------------------------------------------------------
  // 💡 DYNAMIC HTML GENERATION FOR FEES
  // ---------------------------------------------------------
  let feeRows = '';

  if (coverFees && platformFee > 0) {
    feeRows = `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px 0; color: #666;">Platform & Service Fees</td>
        <td style="padding: 10px 0; text-align: right; color: #666;">${currencySymbol}${platformFee.toFixed(
      2
    )}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px 0; color: #666;">GST (10% on Fees)</td>
        <td style="padding: 10px 0; text-align: right; color: #666;">${currencySymbol}${gstOnFee.toFixed(
      2
    )}</td>
      </tr>
    `;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #10B981; margin-bottom: 20px; }
        .header h1 { color: #10B981; margin: 0; font-size: 24px; }
        .content { padding: 10px; }
        .receipt-box { background-color: #f9f9f9; padding: 20px; border-radius: 6px; margin: 20px 0; }
        .amount-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .total-row { font-weight: bold; font-size: 18px; color: #10B981; border-top: 2px solid #eee; padding-top: 10px; }
        .btn { display: inline-block; background-color: #10B981; color: #ffffff; text-decoration: none; padding: 12px 25px; border-radius: 5px; font-weight: bold; margin-top: 20px; text-align: center; }
        .footer { margin-top: 30px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 20px; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Payment Receipt</h1>
        </div>
        
        <div class="content">
          <p>Assalamu Alaikum <strong>${donorName}</strong>,</p>
          <p>Thank you for your generous contribution to <strong>${organizationName}</strong>. Your support makes a real difference.</p>
          
          <div class="receipt-box">
            <p style="margin-top: 0; color: #888; font-size: 14px;">Receipt #: ${receiptNumber}</p>
            <p style="color: #888; font-size: 14px;">Date: ${formattedDate}</p>
            
            <table style="margin-top: 15px;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0;"><strong>Donation Amount (Tax Deductible)</strong></td>
                <td style="padding: 10px 0; text-align: right;"><strong>${currencySymbol}${amount.toFixed(
    2
  )}</strong></td>
              </tr>
              
              ${feeRows}
              
              <tr>
                <td style="padding: 15px 0; font-weight: bold; font-size: 16px;">Total Paid</td>
                <td style="padding: 15px 0; text-align: right; font-weight: bold; font-size: 16px; color: #10B981;">${currencySymbol}${totalAmount.toFixed(
    2
  )}</td>
              </tr>
            </table>
          </div>

          <p>Donation Type: ${
            donationType.charAt(0).toUpperCase() + donationType.slice(1)
          }</p>
          
          <div style="text-align: center;">
            <a href="${pdfUrl}" class="btn" style="color: #ffffff !important;">Download Official Tax Receipt (PDF)</a>
          </div>

          <p style="margin-top: 20px; font-size: 14px;">
            Please retain the attached PDF receipt for your tax records. 
            Donations of $2 or more are tax-deductible in Australia.
          </p>
        </div>

        <div class="footer">
          <p>Crescent Change Platform</p>
          <p>This is an automated email. Please do not reply directly.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Crescent Change" <${config.email.nodemailerEmail}>`,
    to: donorEmail,
    subject: `Donation Receipt - ${organizationName}`,
    html: htmlContent,
    attachments: [
      {
        filename: `Receipt-${receiptNumber}.pdf`,
        path: pdfUrl, // Nodemailer can send from URL
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};

export default sendReceiptEmail;
