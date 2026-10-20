// A small invented room to start from. Replace with your home's evidence.
// All plan points are [x,z] in metres. +z points down the plan; height is +y.
export default {
  title: 'Untitled Home',
  brand: 'HOME STUDY',
  mark: 'h.',
  theme: 'riso',
  lighting: 'day',
  location: '',
  stats: [],
  source: {note: 'Illustrative starter geometry. Replace with a sourced layout.'},
  // floorPlan: {image:'assets/floor-plan.jpg', alt:'Source floor plan', note:'Source and assumptions.'},
  resources: [], // Additional groups, e.g. {name:'Exterior', photos:['assets/exterior.jpg']}
  model: {
    wallHeight: 2.85,
    wallThickness: 0.15,
    cutaway: 1.2,
    outline: [[-3,-2],[3,-2],[3,2],[-3,2]],
    rooms: [{
      id:'main', name:'Main room', featured:true, dimension:'6 × 4 m (illustrative)',
      center:[0,0], polygon:[[-3,-2],[3,-2],[3,2],[-3,2]], surface:'floor',
      // photo:'assets/main.jpg',
      photos: [], // Multiple references, e.g. ['assets/main-1.jpg','assets/main-2.jpg']
    }],
    walls: [
      {a:[-3,-2],b:[3,-2],openings:[{start:2,end:4,type:'window',bottom:.85,top:2.45}]},
      {a:[3,-2],b:[3,2]},
      {a:[3,2],b:[-3,2],openings:[{start:.5,end:1.4,type:'door',bottom:0,top:2.15}]},
      {a:[-3,2],b:[-3,-2]},
    ],
    railings: [],
    voids: [],
  },
};
