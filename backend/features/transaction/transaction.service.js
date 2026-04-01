'use strict';

const Transaction = require('./transaction.model');
const { AppError } = require('../../middleware/errorHandler');
const { daysAgo, paiseToRupees } = require('../../shared/utils/helpers');

const getHistory = async (userId, { limit = 20, page = 1, category, status } = {}) => {
  const filter = { userId };
  if (category) filter.category = category;
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  return {
    transactions: transactions.map(formatTx),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

const getById = async (txId, userId) => {
  const tx = await Transaction.findOne({ txId, userId }).lean();
  if (!tx) throw AppError.notFound('Transaction');
  return formatTx(tx);
};

const formatTx = (tx) => ({
  ...tx,
  amountRupees: paiseToRupees(tx.amountPaise),
});

module.exports = { getHistory, getById };