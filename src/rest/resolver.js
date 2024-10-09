const { ExpressRouter } = require("../tools");

// const { updatePendingOrder } = require("../src/payments/payment_helper");

// ExpressRouter.post("/updatePendingOrder", async (req, res, next) => {
//     try {
//         console.log("api.updatePendingOrder:start");
//         console.log("api.updatePendingOrder:body:", req.body);
//         const order = await updatePendingOrder({
//             input: {
//                 orderReference: req.body.Data.CustomerReference,
//                 hash: req.body.Data.UserDefinedField,
//                 status: req.body.Data.TransactionStatus,
//             },
//         });
//         console.log("api.updatePendingOrder:end:", order);
//         res.json({ message: "success" });
//     } catch (e) {
//         console.log("api.updatePendingOrder:error:", e);
//         res.status(500).json({ message: "error" });
//     }
// });

module.exports = ExpressRouter;
