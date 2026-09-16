/**
 * A request the ledger refuses on purpose, with a reason written for the person
 * who made it. IPC hands it to the renderer as "Rejection: <reason>", an intent
 * records it as a rejected outcome; anything else that is thrown is a failure.
 */
class Rejection extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'Rejection';
  }
}

const REASON = {
  noPrice: 'Вкажіть ціну уроку, щоб записати оплату',
  nothingToRefund: 'Немає оплачених уроків, які можна зняти',
};

module.exports = { Rejection, REASON };
