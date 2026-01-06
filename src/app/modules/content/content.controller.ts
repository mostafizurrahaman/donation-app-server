import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { asyncHandler, sendResponse } from '../../utils';
import { ContentService } from './content.service';

const getContent = asyncHandler(async (req, res) => {
  const content = await ContentService.getContent();

  sendResponse(res, {
    message: 'Content retrived successfully',
    statusCode: httpStatus.OK,
    data: content,
  });
});

const updateContent = asyncHandler(async (req, res) => {
  const content = await ContentService.updateContent(req.body);

  sendResponse(res, {
    message: 'Content updated successfully',
    statusCode: httpStatus.OK,
    data: content,
  });
});

export const contentController = {
  getContent,
  updateContent,
};
