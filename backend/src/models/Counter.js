import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Atomic counter used to generate human-friendly, per-tenant sequential IDs
 * (e.g. ticket #1, #2 ... scoped to each tenant). findOneAndUpdate with
 * { upsert: true } is atomic at the document level, so two concurrent
 * createTicket requests can never receive the same number.
 */
const counterSchema = new Schema({
  _id: { type: String }, // e.g. "ticket:<tenantId>"
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function (key) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
};

const Counter = mongoose.model('Counter', counterSchema);
export default Counter;
