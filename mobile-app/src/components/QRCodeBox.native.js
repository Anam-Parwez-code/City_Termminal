import React from 'react';
import QRCode from 'react-native-qrcode-svg';

const QRCodeBox = ({ value, size = 148 }) => (
  <QRCode value={String(value || '')} size={size} />
);

export default QRCodeBox;
