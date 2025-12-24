import basiq from '@api/basiq';
import config from '../../config';
import Auth from '../Auth/auth.model';
import { AppError } from '../../utils';
import httpStatus from 'http-status';
import Client from '../Client/client.model';

// Generate basic action token
export const getBasiqActionToken = async (): Promise<string> => {
  try {
    // Basic Auth with your API Key
    basiq.auth(`Basic ${config.basiq.apiKey}`);

    const { data } = await basiq.postToken(
      {
        scope: 'SERVER_ACCESS',
      },
      {
        'basiq-version': '3.0',
      }
    );

    return data.access_token;
  } catch (error: any) {
    console.error('BASIQ_TOKEN_ERROR:', error.res?.data || error.message);
    throw new Error('Failed to retrieve Basiq access token');
  }
};

/**
 * Step 2: Get an authenticated SDK instance
 * This returns the 'basiq' object but pre-configured with the Bearer token
 */
export const getBasiqClient = async () => {
  const token = await getBasiqActionToken();
  // Switch from Basic Auth to Bearer Auth for functional calls
  basiq.auth(token);
  return basiq;
};

/**
 * Ensures a Basiq User exists for the given platform user.
 * 1. Checks MongoDB for existing basiqUserId.
 * 2. If missing, calls Basiq API to create a user.
 * 3. Saves the new ID to MongoDB.
 *
 * @param userId - The MongoDB ID of the user (from req.user._id)
 * @returns basiqUserId string
 */
export const getOrCreateBasiqUser = async (userId: string): Promise<string> => {
  // 1. Find user in our database
  const user = await Auth.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found in system');
  }

  const client = await Client.findOne({ uath: user?._id });

  if (!client) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'User Profile not found in system'
    );
  }
  // 2. If user already has a Basiq ID, return it immediately
  if (user.basiqUserId) {
    return user.basiqUserId;
  }

  // 3. Otherwise, Create User in Basiq
  try {
    const basiq = await getBasiqClient();

    const { data } = await basiq.createUser({
      email: user.email,
      businessName: client?.name,
      firstName: client?.name?.split(' ')?.[0] || '',
      lastName: client?.name?.split(' ')?.[1] || '',
      businessAddress: {
        addressLine1: client?.address || '',
      },
      mobile: client?.phoneNumber || '',
      businessIdNo: client?._id?.toString(),
    });

    const newBasiqUserId = data.id;

    // 4. Update our database with the new Basiq ID
    await Auth.findByIdAndUpdate(userId, {
      basiqUserId: newBasiqUserId,
    });

    return newBasiqUserId;
  } catch (error: any) {
    // Handle SDK specific errors
    const errorMessage = error.res?.data?.errors?.[0]?.detail || error.message;
    console.error('BASIQ_USER_CREATE_ERROR:', errorMessage);

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Basiq User Creation Failed: ${errorMessage}`
    );
  }
};
