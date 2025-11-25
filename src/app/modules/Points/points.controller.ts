// src/app/modules/Points/points.controller.ts
import { Request, Response } from 'express';
import { pointsService } from './points.service';
import { sendResponse } from '../../utils';

export const getMyPoints = async (req: Request, res: Response) => {
  const balance = await pointsService.getUserBalance(req.user.id);
  sendResponse(res, {
    statusCode: 200,
    message: 'Success',
    data: balance,
  });
};

export const getMyTransactions = async (req: Request, res: Response) => {
  const query = {
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    source: req.query.source as string,
    transactionType: req.query.type as string,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
  };
  const result = await pointsService.getTransactions(req.user.id, query);
  sendResponse(res, {
    statusCode: 200,
    message: 'Success',
    data: result,
  });
};

export const getLeaderboard = async (req: Request, res: Response) => {
  const tier = req.query.tier as string;
  const leaderboard = await pointsService.getLeaderboard(tier);
  sendResponse(res, {
    statusCode: 200,
    message: 'Leaderboard',
    data: leaderboard,
  });
};
