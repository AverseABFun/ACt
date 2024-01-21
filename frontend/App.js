import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { Header } from 'react-native/Libraries/NewAppScreen';

MapLibreGL.setAccessToken(null); // this is apparently necessary due to an android bug

const apiKey = process.env.MAPLIBRE_TOKEN; // and you thought i would give away my api token, huh?
const styleUrl = `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${apiKey}`;

function MapPage() {
  return (
    <View style={styles.container}>
      <Header 
        leftComponent={null}
        centerComponent={{ text: 'Map', style: { color: '#fff' } }}
        rightComponent={null}
        containerStyle={styles.header}
      />
      <MapLibreGL.MapView
          style={styles.map}
          styleURL={styleUrl}
        />
      <StatusBar style="auto" />
    </View>
  );
}
const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="Map" component={MapPage} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    flex: 1,
    alignSelf: 'stretch',
  },
  header: {
    backgroundColor: '#222',
    justifyContent: 'space-around',
  }
});
