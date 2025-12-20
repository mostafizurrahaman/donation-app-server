import nodemailer from 'nodemailer';
import config from '../config';

interface ISendRewardCodeEmailPayload {
  email: string;
  userName: string;
  rewardTitle: string;
  code: string; // This can be "SAVE20" or "https://giftcard.com/xyz"
  businessName: string;
  rewardImage?: string;
}

const sendRewardCodeEmail = async (payload: ISendRewardCodeEmailPayload) => {
  const { email, userName, rewardTitle, code, businessName, rewardImage } =
    payload;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: config.email.nodemailerEmail,
      pass: config.email.nodemailerPassword,
    },
  });

  // 1. Detect if the "code" is actually a URL (Gift Card link)
  const isUrl = code.startsWith('http://') || code.startsWith('https://');

  // 2. Generate the dynamic HTML block for the Code or the Button
  let actionHtml = '';
  if (isUrl) {
    // If it's a URL, show a professional "Redeem" button
    actionHtml = `
      <div style="text-align: center; margin: 30px 0;">
        <p style="color: #666; font-size: 14px;">Click the button below to access your gift card:</p>
        <a href="${code}" target="_blank" style="display: inline-block; background-color: #10B981; color: #ffffff; text-decoration: none; padding: 15px 35px; border-radius: 8px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          Redeem Gift Card Now
        </a>
        <p style="margin-top: 15px; font-size: 12px; color: #999;">If the button doesn't work, copy this link: <br> <a href="${code}" style="color: #10B981;">${code}</a></p>
      </div>
    `;
  } else {
    // If it's a standard code, show the dashed box
    actionHtml = `
      <div style="background-color: #ecfdf5; padding: 25px; border: 2px dashed #10B981; border-radius: 8px; margin: 20px 0; text-align: center;">
        <span style="font-size: 12px; color: #059669; text-transform: uppercase; font-weight: bold; letter-spacing: 1px; margin-bottom: 8px; display: block;">Your Redemption Code</span>
        <strong style="font-size: 32px; color: #065f46; font-family: 'Courier New', Courier, monospace; font-weight: bold; letter-spacing: 2px;">${code}</strong>
      </div>
    `;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 12px; background-color: #ffffff; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #10B981; margin-bottom: 20px; }
        .header h1 { color: #10B981; margin: 0; font-size: 24px; }
        .content { padding: 10px; }
        .reward-card { background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #eee; text-align: center; }
        .reward-title { font-size: 20px; font-weight: bold; color: #111; margin-bottom: 5px; }
        .business-name { color: #666; font-size: 14px; }
        .instructions { background-color: #fffbeb; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; margin-top: 20px; }
        .instructions h4 { margin: 0 0 10px 0; color: #92400e; }
        .instructions ol { margin: 0; padding-left: 20px; color: #92400e; font-size: 14px; }
        .footer { margin-top: 30px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Reward Unlocked! 🎁</h1>
        </div>
        
        <div class="content">
          <p>Assalamu Alaikum <strong>${userName}</strong>,</p>
          <p>Congratulations! You have successfully used your points to claim a reward. Your contribution to our partner charities has made this possible.</p>
          
          <div class="reward-card">
            <div class="reward-title">${rewardTitle}</div>
            <div class="business-name">Offered by ${businessName}</div>
            ${
              rewardImage
                ? `<img src="${rewardImage}" alt="Reward" style="max-width: 100%; border-radius: 6px; margin-top: 15px;">`
                : ''
            }
          </div>

          ${actionHtml}

          <div class="instructions">
            <h4>How to redeem:</h4>
            <ol>
              ${
                isUrl
                  ? `<li>Click the green button above to open your gift card.</li>
                   <li>Follow the instructions on the business's partner page.</li>`
                  : `<li>Visit the official <strong>${businessName}</strong> website.</li>
                   <li>Add items to your cart and proceed to checkout.</li>
                   <li>Enter the code in the 'Promo/Discount Code' field.</li>`
              }
            </ol>
          </div>
        </div>

        <div class="footer">
          <p>Crescent Change Rewards Platform</p>
          <p>This is an automated email. Please do not reply directly.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Crescent Change Rewards" <${config.email.nodemailerEmail}>`,
    to: email,
    subject: `Your Reward: ${rewardTitle}`,
    html: htmlContent,
  };

  await transporter.sendMail(mailOptions);
};

export default sendRewardCodeEmail;
