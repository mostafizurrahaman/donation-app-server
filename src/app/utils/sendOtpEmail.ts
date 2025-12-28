import httpStatus from 'http-status';
import nodemailer from 'nodemailer';
import config from '../config';
import AppError from './AppError';
import path from 'path';

// Utility function to generate the email HTML content dynamically
const generateEmailHTML = (
  otp: string,
  name: string,
  logoCid: string,
  customMessage: string = ''
) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f7f9fc;
      margin: 0;
      padding: 0;
    }
    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 15px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
      background-image: linear-gradient(to right, #f9fafc, #ffffff);
    }
    .header {
      text-align: center;
      padding-bottom: 30px;
      border-bottom: 3px solid #f0f0f0;
    }
    .header img {
      max-width: 180px;
      margin-bottom: 25px;
    }
    .header h2 {
      color: ${config.preferredWebsite.emailColor || '#C08FFF'};
      font-size: 28px;
      margin-bottom: 10px;
      font-weight: bold;
    }
    .otp {
      font-size: 26px;
      font-weight: bold;
      color: #C08FFF;
      padding: 15px;
      background-color: #FFF8E1; /* Light background */
      border-left: 6px solid #C08FFF; /* Purple left border */
      text-align: center;
      margin: 30px 0;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #888888;
      padding-top: 30px;
      border-top: 2px solid #f0f0f0;
      margin-top: 30px;
    }
    @media only screen and (max-width: 600px) {
      .container {
        padding: 20px;
      }
      .otp {
        font-size: 22px;
        padding: 15px;
      }
      .footer {
        font-size: 10px;
      }
      .header h2 {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>

  <div class="container">
    <div class="header">
      <img src="cid:${logoCid}" alt="Logo">
      <h2>Welcome to ${config.preferredWebsite.name}!</h2>
      <p>We're excited to have you on board.</p>
    </div>

    <p>Hello ${name},</p>
    <p>We received a request to verify your email address. Your one-time password (OTP) is:</p>

    <div class="otp">
      ${otp}
    </div>

    <p>Please enter this OTP to complete your email verification and start using ${
      config.preferredWebsite.name
    }.</p>
    <p><strong>Note:</strong> This OTP will expire in 5 minutes. Be sure to enter it before it expires.</p>

    <!-- Optional Custom Message Section -->
    ${
      customMessage
        ? `<p><strong>Additional Info:</strong> ${customMessage}</p>`
        : ''
    }

    <!-- Footer -->
    <div class="footer">
      <p>Thank you for being a part of ${
        config.preferredWebsite.name
      }. If you did not request this, please ignore this email.</p>
    </div>
  </div>

</body>
</html>
  `;
};

const sendEmail = async ({
  email,
  otp,
  name = 'User',
  subject = 'Your OTP for Account Verification',
  logoCid = 'crescent_change_logo',
  customMessage = '',
  attachments = [],
}: {
  email: string;
  otp: string;
  name?: string;
  subject?: string;
  logoCid?: string;
  customMessage?: string;
  attachments?: { filename: string; path: string }[];
}) => {
  // console.log({
  //   user: config.email.nodemailerEmail,
  //   pass: config.email.nodemailerPassword,
  //   otp,
  // });
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: config.email.nodemailerEmail,
        pass: config.email.nodemailerPassword,
      },
    });

    // Generate the HTML content dynamically
    const htmlTemplate = generateEmailHTML(otp, name, logoCid, customMessage);
    console.log({ email });

    // Email options: from, to, subject, and HTML body
    const mailOptions = {
      from: `${config.preferredWebsite.name} 🌙 <${config.email.nodemailerEmail}>`,
      to: email,
      subject: subject,
      html: htmlTemplate,
      attachments: [
        ...attachments, // Attach any custom attachments
        {
          filename: 'logo.png',
          path: path.join(__dirname, 'assets', 'logo.png'),
          cid: logoCid, // Embed logo with CID
        },
      ],
    };

    // Send the email using Nodemailer
    await transporter.sendMail(mailOptions);
  } catch (error) {
    // Log the error and throw a custom error with a message
    // eslint-disable-next-line no-console
    console.log(error);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to send email'
    );
  }
};

export default sendEmail;
