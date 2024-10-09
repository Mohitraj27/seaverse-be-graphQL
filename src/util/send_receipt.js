const AwsHelper = require("./aws_helper");

module.exports = {
    sendEmailReceipt: async (paymentDetails, orderDetails, customerDetails) => {
        const date = paymentDetails.date;
        const total = paymentDetails.total;
        const invoiceId = paymentDetails.invoiceReference;
        const deliveryCharge = orderDetails.deliveryCharge;
        const customerName = customerDetails.firstName + " " + customerDetails.lastName;
        const building =
            customerDetails.floor + "," + customerDetails.apartment || customerDetails.building;
        const street = customerDetails.street + "," + customerDetails.avenue;
        const area = customerDetails.addressArea;
        const block = customerDetails.block;
        const foodItems = orderDetails.items;
        const email = customerDetails.email || "orderhomeyapp@gmail.com";
        var items = "";
        var addons = "-";
        var prices = "";

        foodItems.forEach(item => {
            item.addons.forEach(addon => {
                addons += addon.nameEn + ",";
            });
            items +=
                "<br>" +
                item.nameEn +
                "(" +
                item.variant.nameEn +
                ")" +
                "<br>" +
                addons +
                "</br" +
                "</br>";
            addons = "-";
            prices +=
                "<br>" +
                item.quantity +
                "x  " +
                item.price +
                " KWD" +
                "</br>" +
                "<br>" +
                " " +
                "</br>";
        });

        const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <title>Email Receipt</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://code.jquery.com/jquery-3.5.1.js"></script>
    <style type="text/css">
      /**
   * Google webfonts. Recommended to include the .woff version for cross-client compatibility.
   */
      @media screen {
        @font-face {
          font-family: 'Source Sans Pro';
          font-style: normal;
          font-weight: 400;
          src: local('Source Sans Pro Regular'), local('SourceSansPro-Regular'),
            url(https://fonts.gstatic.com/s/sourcesanspro/v10/ODelI1aHBYDBqgeIAH2zlBM0YzuT7MdOe03otPbuUS0.woff)
              format('woff');
        }

        @font-face {
          font-family: 'Source Sans Pro';
          font-style: normal;
          font-weight: 700;
          src: local('Source Sans Pro Bold'), local('SourceSansPro-Bold'),
            url(https://fonts.gstatic.com/s/sourcesanspro/v10/toadOcfmlt9b38dHJxOBGFkQc6VGVFSmCnC_l7QZG60.woff)
              format('woff');
        }
      }

      /**
   * Avoid browser level font resizing.
   * 1. Windows Mobile
   * 2. iOS / OSX
   */
      body,
      table,
      td,
      a {
        -ms-text-size-adjust: 100%; /* 1 */
        -webkit-text-size-adjust: 100%; /* 2 */
      }

      /**
   * Remove extra space added to tables and cells in Outlook.
   */
      table,
      td {
        mso-table-rspace: 0pt;
        mso-table-lspace: 0pt;
      }

      /**
   * Better fluid images in Internet Explorer.
   */
      img {
        -ms-interpolation-mode: bicubic;
      }

      /**
   * Remove blue links for iOS devices.
   */
      a[x-apple-data-detectors] {
        font-family: inherit !important;
        font-size: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        color: inherit !important;
        text-decoration: none !important;
      }

      /**
   * Fix centering issues in Android 4.4.
   */
      div[style*='margin: 16px 0;'] {
        margin: 0 !important;
      }

      body {
        width: 100% !important;
        height: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      /**
   * Collapse table borders to avoid space between cells.
   */
      table {
        border-collapse: collapse !important;
      }

      a {
        color: #1a82e2;
      }

      img {
        height: auto;
        line-height: 100%;
        text-decoration: none;
        border: 0;
        outline: none;
      }
    </style>
  </head>
  <body style="background-color: #f9f5d6">
    <!-- start preheader -->
    <div
      class="preheader"
      style="
        display: none;
        max-width: 0;
        max-height: 0;
        overflow: hidden;
        font-size: 1px;
        line-height: 1px;
        color: #fff;
        opacity: 0;
      "
    >
      Homey receipt
    </div>
    <!-- end preheader -->

    <!-- start body -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
      <!-- start logo -->
      <tr>
        <td align="center" bgcolor="#F9F5D6">
          <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
          <table
            border="0"
            cellpadding="0"
            cellspacing="0"
            width="100%"
            style="max-width: 600px"
          >
            <tr>
              <td align="center" valign="top" style="padding: 36px 24px"></td>
            </tr>
          </table>
          <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
        </td>
      </tr>
      <!-- end logo -->
      <!-- start hero -->
      <tr>
        <td align="center" bgcolor="#F9F5D6">
          <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
          <table
            border="0"
            cellpadding="0"
            cellspacing="0"
            width="100%"
            style="max-width: 600px"
          >
            <tr>
              <td
                align="left"
                bgcolor="#ffffff"
                style="
                  padding: 36px 24px 0;
                  font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif;
                  border-top: 3px solid #d4dadf;
                "
              >
                <img
                  src="https://orderhomey.com/wp-content/uploads/2021/02/final-logo-01.png"
                  alt="Logo"
                  border="0"
                  width="100"
                  style="
                    display: block;
                    width: 100px;
                    max-width: 100px;
                    min-width: 100px;
                  "
                />
              </td>
              <td
                align="right"
                bgcolor="#ffffff"
                style="
                  padding: 36px 24px 0;
                  font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif;
                  border-top: 3px solid #d4dadf;
                "
              >
                <h1
                  style="
                    margin: 0;
                    font-size: 20px;
                    font-weight: 250;
                    letter-spacing: -1px;
                    line-height: 48px;
                  "
                >
                  ${date}
                </h1>
              </td>
            </tr>
          </table>
          <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
        </td>
      </tr>
      <!-- end hero -->

      <!-- start copy block -->
      <tr>
        <td align="center" bgcolor="#F9F5D6">
          <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
          <table
            id="table"
            border="0"
            cellpadding="0"
            cellspacing="0"
            width="100%"
            style="max-width: 600px"
          >
            <!-- start copy -->
            <!-- <tr>
							<td
								align="left"
								bgcolor="#ffffff"
								style="
									padding: 24px;
									font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif;
									font-size: 16px;
									line-height: 24px;
								"
							>
								<p style="margin: 0">Order Receipt -</p>
							</td>
						</tr> -->
            <!-- end copy -->

            <!-- start receipt table -->
            <tr>
              <td
                align="left"
                bgcolor="#ffffff"
                style="
                  padding: 24px;
                  font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif;
                  font-size: 16px;
                  line-height: 24px;
                "
              >
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td
                      align="left"
                      bgcolor="#F9F5D6"
                      width="75%"
                      style="
                        padding: 12px;
                        font-family: 'Source Sans Pro', Helvetica, Arial,
                          sans-serif;
                        font-size: 16px;
                        line-height: 24px;
                      "
                    >
                      <strong>Order Receipt </strong>
                    </td>
                    <td
                      align="left"
                      bgcolor="#F9F5D6"
                      width="25%"
                      style="
                        padding: 12px;
                        font-family: 'Source Sans Pro', Helvetica, Arial,
                          sans-serif;
                        font-size: 16px;
                        line-height: 24px;
                      "
                    >
                      <strong>${invoiceId}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td
                      align="left"
                      width="75%"
                      style="
                        padding: 6px 12px;
                        font-family: 'Source Sans Pro', Helvetica, Arial,
                          sans-serif;
                        font-size: 16px;
                        line-height: 24px;
                      "
                    >
                      ${items}
                    </td>
                    <td
                      align="left"
                      width="25%"
                      style="
                        padding: 6px 12px;
                        font-family: 'Source Sans Pro', Helvetica, Arial,
                          sans-serif;
                        font-size: 16px;
                        line-height: 24px;
                      "
                    >
                      ${prices}
                    </td>
                  </tr>
                  <tr>
                    <td
                      align="left"
                      width="75%"
                      style="
                        padding: 6px 12px;
                        font-family: 'Source Sans Pro', Helvetica, Arial,
                          sans-serif;
                        font-size: 16px;
                        line-height: 24px;
                      "
                    >
                      Delivery Charge
                    </td>
                    <td
                      align="left"
                      width="25%"
                      style="
                        padding: 6px 12px;
                        font-family: 'Source Sans Pro', Helvetica, Arial,
                          sans-serif;
                        font-size: 16px;
                        line-height: 24px;
                      "
                    >
                      ${deliveryCharge} KWD
                    </td>
                  </tr>
                  <!-- <tr>
										<td
											align="left"
											width="75%"
											style="
												padding: 6px 12px;
												font-family: 'Source Sans Pro', Helvetica, Arial,
													sans-serif;
												font-size: 16px;
												line-height: 24px;
											"
										>
											Sales Tax
										</td>
										<td
											align="left"
											width="25%"
											style="
												padding: 6px 12px;
												font-family: 'Source Sans Pro', Helvetica, Arial,
													sans-serif;
												font-size: 16px;
												line-height: 24px;
											"
										>
											$0.00
										</td>
									</tr> -->
                  <tr>
                    <td
                      align="left"
                      width="75%"
                      style="
                        padding: 12px;
                        font-family: 'Source Sans Pro', Helvetica, Arial,
                          sans-serif;
                        font-size: 16px;
                        line-height: 24px;
                        border-top: 2px dashed #f9f5d6;
                        border-bottom: 2px dashed #f9f5d6;
                      "
                    >
                      <strong>Total</strong>
                    </td>
                    <td
                      align="left"
                      width="25%"
                      style="
                        padding: 12px;
                        font-family: 'Source Sans Pro', Helvetica, Arial,
                          sans-serif;
                        font-size: 16px;
                        line-height: 24px;
                        border-top: 2px dashed #f9f5d6;
                        border-bottom: 2px dashed #f9f5d6;
                      "
                    >
                      <strong>${total} KWD</strong>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- end reeipt table -->
          </table>
          <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
        </td>
      </tr>
      <!-- end copy block -->

      <!-- start receipt address block -->
      <tr>
        <td align="center" bgcolor="#F9F5D6" valign="top" width="100%">
          <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
          <table
            align="center"
            bgcolor="#ffffff"
            border="0"
            cellpadding="0"
            cellspacing="0"
            width="100%"
            style="max-width: 600px"
          >
            <tr>
              <td
                align="center"
                valign="top"
                style="font-size: 0; border-bottom: 3px solid #d4dadf"
              >
                <!--[if (gte mso 9)|(IE)]>
              <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
              <tr>
              <td align="left" valign="top" width="300">
              <![endif]-->
                <div
                  style="
                    display: inline-block;
                    width: 100%;
                    max-width: 50%;
                    min-width: 240px;
                    vertical-align: top;
                  "
                >
                  <table
                    align="left"
                    border="0"
                    cellpadding="0"
                    cellspacing="0"
                    width="100%"
                    style="max-width: 300px"
                  >
                    <tr>
                      <td
                        align="left"
                        valign="top"
                        style="
                          padding-bottom: 36px;
                          padding-left: 36px;
                          font-family: 'Source Sans Pro', Helvetica, Arial,
                            sans-serif;
                          font-size: 16px;
                          line-height: 24px;
                        "
                      >
                        <p><strong>${customerName}</strong></p>
                        <p>
                          ${building}<br />${street}<br />${area}<br />${block}
                        </p>
                      </td>
                    </tr>
                  </table>
                </div>
                <!--[if (gte mso 9)|(IE)]>
              </td>
              <td align="left" valign="top" width="300">
              <![endif]-->
                <div
                  style="
                    display: inline-block;
                    width: 100%;
                    max-width: 50%;
                    min-width: 240px;
                    vertical-align: top;
                  "
                >
                  <table
                    align="left"
                    border="0"
                    cellpadding="0"
                    cellspacing="0"
                    width="100%"
                    style="max-width: 300px"
                  >
                    <tr>
                      <td
                        align="left"
                        valign="top"
                        style="
                          padding-bottom: 36px;
                          padding-left: 36px;
                          font-family: 'Source Sans Pro', Helvetica, Arial,
                            sans-serif;
                          font-size: 16px;
                          line-height: 24px;
                        "
                      >
                        <!-- <p><strong>Vendor</strong></p>
                        <p>
                          1234 S. Broadway Ave<br />Unit 2<br />Denver, CO 80211
                        </p> -->
                      </td>
                    </tr>
                  </table>
                </div>
                <!--[if (gte mso 9)|(IE)]>
              </td>
              </tr>
              </table>
              <![endif]-->
              </td>
            </tr>
          </table>
          <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
        </td>
      </tr>
      <!-- end receipt address block -->

      <!-- start footer -->
      <tr>
        <td align="center" bgcolor="#F9F5D6" style="padding: 24px">
          <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
          <table
            border="0"
            cellpadding="0"
            cellspacing="0"
            width="100%"
            style="max-width: 600px"
          >
            <!-- start permission -->
            <tr>
              <td
                align="center"
                bgcolor="#F9F5D6"
                style="
                  padding: 12px 24px;
                  font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif;
                  font-size: 14px;
                  line-height: 20px;
                  color: #666;
                "
              >
                <!-- <p style="margin: 0">
									You received this email because we received a request for
									[type_of_action] for your account. If you didn't request
									[type_of_action] you can safely delete this email.
								</p> -->
              </td>
            </tr>
            <!-- end permission -->

            <!-- start unsubscribe -->
            <tr>
              <td
                align="center"
                bgcolor="#F9F5D6"
                style="
                  padding: 12px 24px;
                  font-family: 'Source Sans Pro', Helvetica, Arial, sans-serif;
                  font-size: 14px;
                  line-height: 20px;
                  color: #666;
                "
              >
                <!-- <p style="margin: 0">
									To stop receiving these emails, you can
									<a href="https://sendgrid.com" target="_blank">unsubscribe</a>
									at any time.
								</p> -->
              </td>
            </tr>
            <!-- end unsubscribe -->
          </table>
          <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
        </td>
      </tr>
      <!-- end footer -->
    </table>

    <!-- end body -->
  </body>
</html>
`;
        
        await AwsHelper.sendEmail(email, "Homey Order Receipt", htmlContent);
    },
};
