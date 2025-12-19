import firebaseAdmin from '../lib/firebase';
import { FcmToken } from '../modules/FcmToken/fcmToken.model';

/**
 * Sends a Push Notification to all devices registered to a specific user
 */
export const sendPushNotification = async (
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) => {
  try {
    // 1. Get all tokens for this user
    // const userTokens = await FcmToken.find({ user: userId });
    // if (userTokens.length === 0) return;

    // const tokens = userTokens.map((t) => t.token);

    // 2. Build the message
    // const message = {
    //   notification: { title, body },
    //   data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
    //   tokens: tokens,
    // };

    const message = {
      topic: 'test-topic',
      notification: {
        title: 'Topic Test',
        body: 'No device required',
      },
    };

    // 3. Send Multicast
    const response = await firebaseAdmin.messaging().send(message);
    // .sendEachForMulticast(message);
    console.log(response);
    return response;
    // 4. Production Cleanup: Remove invalid/expired tokens from DB
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(tokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        await FcmToken.deleteMany({ token: { $in: tokensToRemove } });
      }
    }

    return response;
  } catch (error) {
    console.error('FCM Error:', error);
  }
};
