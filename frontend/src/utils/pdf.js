// //import pdfMake from 'pdfmake/build/pdfmake';
// //import pdfFonts from 'pdfmake/build/vfs_fonts';

// //pdfMake.vfs = pdfFonts.pdfMake.vfs;

// //function buildItemsTable(items) {
//   const body = [
//     ['Description', 'Qté', 'PU', 'Total'],
//     ...items.map((item) => [
//       item.description,
//       { text: item.quantity.toString(), alignment: 'right' },
//       { text: item.unit_price.toFixed(2) + '€', alignment: 'right' },
//       { text: item.total.toFixed(2) + '€', alignment: 'right' }
//     ])
//   ];
//   return {
//     table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body },
//     layout: 'lightHorizontalLines',
//     margin: [0, 10, 0, 10]
//   };
// }

// export function generateQuotePDF(quote) {
//   const docDefinition = {
//     content: [
//       { text: `Devis ${quote.quote_number}`, style: 'header' },
//       { text: quote.client_name, style: 'subheader' },
//       buildItemsTable(quote.items),
//       {
//         columns: [
//           { width: '*', text: '' },
//           {
//             width: 'auto',
//             table: {
//               body: [
//                 ['Sous-total', `${quote.subtotal.toFixed(2)}€`],
//                 [
//                   `TVA (${quote.tax_rate}%)`,
//                   `${quote.tax_amount.toFixed(2)}€`
//                 ],
//                 [{ text: 'Total', bold: true }, { text: `${quote.total.toFixed(2)}€`, bold: true }]
//               ]
//             },
//             layout: 'noBorders'
//           }
//         ]
//       }
//     ],
//     styles: {
//       header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
//       subheader: { fontSize: 14, margin: [0, 0, 0, 10] }
//     }
//   };

//   pdfMake.createPdf(docDefinition).open();
// }

// Temporary stubs while PDF generation is disabled
export function generateQuotePDF() {
  console.warn('PDF export is temporarily disabled');
}

export function generateInvoicePDF() {
  console.warn('PDF export is temporarily disabled');
}

// export function generateInvoicePDF(invoice) {
//   const docDefinition = {
//     content: [
//       { text: `Facture ${invoice.invoice_number}`, style: 'header' },
//       { text: invoice.client_name, style: 'subheader' },
//       buildItemsTable(invoice.items),
//       {
//         columns: [
//           { width: '*', text: '' },
//           {
//             width: 'auto',
//             table: {
//               body: [
//                 ['Sous-total', `${invoice.subtotal.toFixed(2)}€`],
//                 [
//                   `TVA (${invoice.tax_rate}%)`,
//                   `${invoice.tax_amount.toFixed(2)}€`
//                 ],
//                 [
//                   { text: 'Total', bold: true },
//                   { text: `${invoice.total.toFixed(2)}€`, bold: true }
//                 ]
//               ]
//             },
//             layout: 'noBorders'
//           }
//         ]
//       }
//     ],
//     styles: {
//       header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
//       subheader: { fontSize: 14, margin: [0, 0, 0, 10] }
//     }
//   };

//   pdfMake.createPdf(docDefinition).open();
// }
