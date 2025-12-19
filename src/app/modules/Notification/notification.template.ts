import config from '../../config';
import { TNotification } from './notification.constant';

const baseEmailTemplate = (
  title: string,
  message: string,
  actionText?: string,
  redirectUrl?: string
) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        margin: 0;
        padding: 0;
      }
      .container {
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      }
      .header {
        text-align: center;
        padding-bottom: 20px;
        border-bottom: 2px solid #f0f0f0;
      }
      .header img {
        max-width: 120px;
        margin-bottom: 10px;
      }
      h2 {
        color: #816A6B;
      }
      .message {
        font-size: 16px;
        color: #444444;
        margin: 20px 0;
      }
      .btn {
        display: inline-block;
        padding: 12px 20px;
        background-color: #816A6B;
        color: #ffffff;
        text-decoration: none;
        border-radius: 6px;
        margin: 20px 0;
      }
      .footer {
        text-align: center;
        font-size: 12px;
        color: #888888;
        padding-top: 20px;
        border-top: 2px solid #f0f0f0;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="cid:crescent_change_logo" alt="Steady Hands Logo"/>
        <h2>${title}</h2>
      </div>
      <div class="message">${message}</div>
      ${
        actionText && redirectUrl
          ? `<div style="text-align:center"><a href="${redirectUrl}" class="btn">${actionText}</a></div>`
          : ''
      }
      <div class="footer">
        <p>Thank you for being part of Steady Hands.</p>
      </div>
    </div>
  </body>
  </html>
`;

export interface BookingRequestPayload {
  fullName: string;
  serviceName: string;
}

export interface ConfirmedBookingPayload {
  fullName: string;
  serviceName: string;
  date: string;
}

export interface CompletedBookingPayload {
  fullName: string;
  serviceName: string;
}

export interface CancelBookingPayload {
  fullName: string;
  serviceName: string;
}

export interface GuestComingPayload {
  fullName: string;
  guestName: string;
  date: string;
}

export type NotificationPayloads =
  | BookingRequestPayload
  | ConfirmedBookingPayload
  | CompletedBookingPayload
  | CancelBookingPayload
  | GuestComingPayload;

// Templates for each notification type
// export const notificationTemplates: Record<
//   TNotification,
//   (data: NotificationPayloads) => string
// > = {
//   booking_request: (data: NotificationPayloads) => {
//     const { fullName, serviceName } = data as BookingRequestPayload;
//     return baseEmailTemplate(
//       'New Booking Request',
//       `Hello ${fullName}, you have a new booking request for <b>${serviceName}</b>. Please review and confirm.`,
//       'View Booking',
//       `${config.clientUrl}/bookings`
//     );
//   },

//   confirmed_booking: (data: NotificationPayloads) => {
//     const { fullName, serviceName, date } = data as ConfirmedBookingPayload;
//     return baseEmailTemplate(
//       'Booking Confirmed',
//       `Hi ${fullName}, your booking for <b>${serviceName}</b> on <b>${date}</b> has been confirmed.`,
//       'View Details',
//       `${config.clientUrl}/bookings`
//     );
//   },

//   completed_booking: (data: NotificationPayloads) => {
//     const { fullName, serviceName } = data as CompletedBookingPayload;
//     return baseEmailTemplate(
//       'Booking Completed',
//       `Hello ${fullName}, your booking for <b>${serviceName}</b> is now marked as completed. Thank you!`
//     );
//   },

//   cancel_booking: (data: NotificationPayloads) => {
//     const { fullName, serviceName } = data as CancelBookingPayload;
//     return baseEmailTemplate(
//       'Booking Cancelled',
//       `Dear ${fullName}, your booking for <b>${serviceName}</b> has been cancelled. Please contact support if you think this is a mistake.`
//     );
//   },

//   guest_coming: (data: NotificationPayloads) => {
//     const { fullName, guestName, date } = data as GuestComingPayload;
//     return baseEmailTemplate(
//       'Guest is Coming',
//       `Hi ${fullName}, your guest <b>${guestName}</b> is coming on <b>${date}</b>. Please be prepared.`
//     );
//   },

//   join_studio_request: (data: NotificationPayloads) => {
//     // You may want to define a specific payload interface for this notification type
//     // For now, we'll use fullName as a generic example
//     const { fullName } = data;

//     return baseEmailTemplate(
//       'Studio Join Request',
//       `Hello${
//         fullName ? ' ' + fullName : ''
//       }, you have a new request to join the studio. Please review the details.`,
//       'Review Request',
//       `${config.clientUrl}/studio-requests`
//     );
//   },
// };

// // Send Notification Email
