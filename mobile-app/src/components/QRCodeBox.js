import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../theme';

const QRCodeBox = ({ value, size = 148 }) => {
  const text = String(value || '');
  const cells = Array.from({ length: 49 }, (_, index) => {
    const code = text.charCodeAt(index % Math.max(1, text.length)) || index;
    return (code + index * 7) % 3 !== 0;
  });

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View style={styles.grid}>
        {cells.map((filled, index) => (
          <View key={index} style={[styles.cell, filled && styles.cellFilled]} />
        ))}
      </View>
      <Text style={styles.label}>QR</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  grid: {
    width: '82%',
    height: '82%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.285%',
    height: '14.285%',
    backgroundColor: theme.colors.white,
  },
  cellFilled: {
    backgroundColor: theme.colors.black,
  },
  label: {
    position: 'absolute',
    color: theme.colors.careemGreen,
    fontWeight: '900',
    fontSize: 11,
  },
});

export default QRCodeBox;
