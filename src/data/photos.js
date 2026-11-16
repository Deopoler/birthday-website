// 사진 보드 데이터. 실제 사진은 public/photos/ 에 넣고 src에 './photos/파일명'으로 적는다.
// 지금은 색상 더미(src가 없으면 color 배경으로 표시).
const colors = ['#f9c6d0', '#c6e2f9', '#d4f0c0', '#fde9a9', '#e0cdf5', '#ffd5b0']
export const photos = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  src: null,
  color: colors[i % colors.length],
}))
