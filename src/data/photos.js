// 사진 보드 데이터.
// 이 파일을 직접 편집할 필요가 없습니다.
// 저장소 루트의 photos/ 폴더에 사진 파일을 넣으면 빌드·개발 서버가 자동으로 목록을 만들고 크기를 줄여 불러옵니다.
// photos/ 폴더가 비어 있으면 dummyPhotos(색상 더미)를 대신 표시합니다. 자세한 사용법은 README.md 참고.
import { photos as realPhotos } from 'virtual:photos'
import { dummyPhotos } from './dummyPhotos'

export const photos = realPhotos.length > 0 ? realPhotos : dummyPhotos
