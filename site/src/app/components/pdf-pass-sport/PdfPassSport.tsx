import React from 'react';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatDate } from '@/utils/date';
import path from 'path';

const regular = path.resolve(process.cwd(), 'assets', 'marianne-regular');
const bold = path.resolve(process.cwd(), 'assets', 'marianne-bold');

Font.register({
  family: 'Marianne',
  fonts: [
    { src: regular, fontWeight: 400 },
    { src: bold, fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 44.5,
    gap: 24,
    fontFamily: 'Marianne',
  },
  descriptionContainer: {
    width: '50%',
  },
  sectionText: {
    fontSize: 12,
    marginBottom: 16,
    marginTop: 4,
    lineHeight: '20px',
  },
  text: {
    fontSize: 12,
    marginBottom: 8,
    lineHeight: '20px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
  },
  mainTitle: {
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 8,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  smallTitle: {
    fontWeight: 'bold',
    fontSize: 10,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  listItem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    gap: 0,
  },
  lastListItem: {
    display: 'flex',
    flexDirection: 'row',
  },
  bullet: {
    marginLeft: 12,
    marginRight: 4,
    marginTop: 4,
    fontSize: 8,
  },
  bulletText: {
    fontSize: 10,
    marginTop: 4,
  },
  seeMoreInfoText: {
    fontSize: 10,
    color: '#666666',
    marginTop: 12,
  },
  // Dashed line separator
  separator: {
    height: '100%',
    width: '1px',
    borderRight: '1px dashed #DDDDDD',
  },
  // pass Sport code styles
  codeContainer: {
    position: 'relative',
    width: '50%',
    borderWidth: '5px',
    borderColor: '#CE614A',
    borderRadius: '12px',
    padding: 24,
    textAlign: 'center',
    fontSize: 10,
    height: 360,
  },
  leftLines: {
    position: 'absolute',
    height: '300px',
    left: 0,
    top: 14,
  },
  rightLines: {
    position: 'absolute',
    height: '300px',
    right: 0,
    top: 14,
  },
  codeHintText: {
    color: '#666666',
    fontSize: 9,
  },
  imagesContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  codeTextContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  ministereLogo: {
    width: '100px',
    height: '72px',
  },
  passSportLogo: {
    width: '100px',
    height: '40px',
  },
  textCode: {
    fontWeight: 'bold',
    fontSize: 30,
  },
  codeFirstname: {
    fontSize: 11,
  },
  codeLastname: {
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  codeDobTitle: {
    fontSize: 41,
    color: '#666666',
  },
  codeDobValue: {
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  codeTitle: {
    fontSize: 11,
    color: '#666666',
  },
  codeValue: {
    fontSize: 30,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
});

type PdfPassSportProps = {
  benef: {
    firstname: string;
    lastname: string;
    dob: string;
    code: string;
    gender: 'F' | 'M';
  };
};

function getAsset(filename: string) {
  return path.resolve(process.cwd(), 'assets', filename);
}

export default function PdfPassSport({
  benef: { firstname, lastname, dob, code, gender },
}: PdfPassSportProps) {
  // todo: to remove when ready
  // const firstname = 'X';
  // const lastname = 'X';
  // const gender = 'M';
  // const code = 'XX-XXXX-XXXX';
  // const dob = '2025-12-31';

  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">
        <View style={styles.codeContainer}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={getAsset('left-lines.png')} style={styles.leftLines} />
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={getAsset('right-lines.png')} style={styles.rightLines} />
          <View style={styles.imagesContainer}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={getAsset('bloc-ministere.png')} style={styles.ministereLogo} />
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={getAsset('pass-sport-logo.png')} style={styles.passSportLogo} />
          </View>
          <View style={styles.codeTextContainer}>
            <Text style={styles.codeFirstname}>{firstname}</Text>
            <Text style={styles.codeLastname}>{lastname}</Text>
            <Text style={styles.codeDobTitle}>{gender === 'M' ? 'Né le' : 'Née le '}</Text>
            <Text style={styles.codeDobValue}>{formatDate(dob)}</Text>
            <Text style={styles.codeTitle}>Code</Text>
            <Text style={styles.codeValue}>{code}</Text>
            <Text style={styles.codeHintText}>Présentez ce pass à votre club</Text>
            <Text style={styles.codeHintText}>Code valable jusqu’au 31 décembre 2025</Text>
            <Text style={styles.codeHintText}>(strictement personnel)</Text>
          </View>
        </View>
        <View style={styles.separator}></View>
        <View style={styles.descriptionContainer}>
          <Text style={styles.mainTitle}>Comment activer le pass Sport ?</Text>
          <View style={styles.section}>
            <Text style={styles.sectionText}>
              Rapprochez-vous de votre structure pour savoir si elle accepte le pass Sport ou
              consultez la liste des structures partenaires sur www.pass.sports.gouv.fr.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.title}>Si vous n’avez pas encore effectué votre inscription</Text>

            <Text style={styles.sectionText}>
              Pour activer votre code, il suffit de présenter votre code à votre club, association
              ou salle de sport au moment de l’inscription. Celui-ci déduira automatiquement 70€ du
              prix de la licence ou de l&apos;abonnement au moment de l&apos;inscription.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.title}>Si vous avez déjà effectué votre inscription</Text>
            <Text style={styles.sectionText}>
              Si vous avez déjà payé l&apos;intégralité de votre inscription et que tous les
              paiements ont été encaissés, votre club pourra vous rembourser 70€ en échange de votre
              pass Sport.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.title}>Ce que vous ne pouvez pas faire avec le pass Sport :</Text>
            <View style={styles.list}>
              <View style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Recevoir directement les 70€ ;</Text>
              </View>
              <View style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>Le donner à quelqu’un d’autre ;</Text>
              </View>
              <View style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  Acheter du matériel ou de l’équipement sportif ;
                </Text>
              </View>
              <View style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  Financer des stages ou séances de découverte ;
                </Text>
              </View>
              <View style={styles.lastListItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>
                  Vous faire rembourser le pass Sport par un club (sauf si le club ne l’a pas encore
                  saisi et accepte de vous rembourser de votre inscription).
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.seeMoreInfoText}>
              Consultez www.pass.sports.gouv.fr pour plus d’informations.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
