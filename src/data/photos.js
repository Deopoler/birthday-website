// 사진 보드 데이터.
// 이 파일을 직접 편집할 필요가 없습니다.
// content/photos/ 폴더(비공개 저장소의 로컬 복사본)에 사진 파일을 넣으면 빌드·개발 서버가 자동으로 목록을 만들고 크기를 줄여 불러옵니다.
// 사진이 없으면 dummyPhotos(색상 더미)를 대신 표시합니다. 자세한 사용법은 README.md 참고.
import { photos as realPhotos } from 'virtual:photos'
import { dummyPhotos } from './dummyPhotos'

export const photos = realPhotos.length > 0 ? realPhotos : dummyPhotos
